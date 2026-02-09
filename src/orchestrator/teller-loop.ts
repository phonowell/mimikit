import { nowIso, sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import {
  consumeThinkerDecisions,
  consumeUserInputs,
  consumeWorkerResults,
  publishTellerDigest,
} from '../streams/channels.js'
import { formatDecisionForUser, runTellerDigest } from '../teller/runner.js'

import type { RuntimeState } from './runtime-state.js'
import type { TaskResult } from '../types/index.js'

type TellerBuffer = {
  inputs: RuntimeState['inflightInputs']
  results: TaskResult[]
  lastInputAt: number
  firstResultAt: number
}

const createTellerBuffer = (): TellerBuffer => ({
  inputs: [],
  results: [],
  lastInputAt: 0,
  firstResultAt: 0,
})

const clearTellerBuffer = (buffer: TellerBuffer): void => {
  buffer.inputs = []
  buffer.results = []
  buffer.lastInputAt = 0
  buffer.firstResultAt = 0
}

const appendPacketsToBuffer = <TPayload>(params: {
  packets: Array<{ payload: TPayload; cursor: number }>
  pushPayload: (payload: TPayload) => void
  setCursor: (cursor: number) => void
}): boolean => {
  if (params.packets.length === 0) return false
  for (const packet of params.packets) {
    params.pushPayload(packet.payload)
    params.setCursor(packet.cursor)
  }
  return true
}

export const tellerLoop = async (runtime: RuntimeState): Promise<void> => {
  const buffer = createTellerBuffer()
  while (!runtime.stopped) {
    const now = Date.now()
    const inputPackets = await consumeUserInputs({
      paths: runtime.paths,
      fromCursor: runtime.channels.teller.userInputCursor,
      limit: 100,
    })
    if (
      appendPacketsToBuffer({
        packets: inputPackets,
        pushPayload: (payload) => {
          buffer.inputs.push(payload)
        },
        setCursor: (cursor) => {
          runtime.channels.teller.userInputCursor = cursor
        },
      })
    )
      buffer.lastInputAt = now

    const resultPackets = await consumeWorkerResults({
      paths: runtime.paths,
      fromCursor: runtime.channels.teller.workerResultCursor,
      limit: 100,
    })
    if (
      appendPacketsToBuffer({
        packets: resultPackets,
        pushPayload: (payload) => {
          buffer.results.push(payload)
        },
        setCursor: (cursor) => {
          runtime.channels.teller.workerResultCursor = cursor
        },
      })
    )
      if (buffer.firstResultAt === 0) buffer.firstResultAt = now

    const decisionPackets = await consumeThinkerDecisions({
      paths: runtime.paths,
      fromCursor: runtime.channels.teller.thinkerDecisionCursor,
      limit: 20,
    })
    if (decisionPackets.length > 0) {
      const history = await readHistory(runtime.paths.history)
      for (const packet of decisionPackets) {
        runtime.channels.teller.thinkerDecisionCursor = packet.cursor
        const response = await formatDecisionForUser({
          workDir: runtime.config.workDir,
          tasks: runtime.tasks,
          history,
          decision: packet.payload.decision,
          inputIds: packet.payload.inputIds,
          inputs: runtime.inflightInputs,
          timeoutMs: Math.max(5_000, runtime.config.teller.pollMs * 20),
          model: runtime.config.teller.model,
          modelReasoningEffort: runtime.config.teller.modelReasoningEffort,
        })
        await appendHistory(runtime.paths.history, {
          id: `assistant-${Date.now()}-${packet.cursor}`,
          role: 'assistant',
          text: response.text,
          createdAt: nowIso(),
          ...(response.usage ? { usage: response.usage } : {}),
          ...(response.elapsedMs !== undefined
            ? { elapsedMs: response.elapsedMs }
            : {}),
        })
      }
      const consumed = new Set(
        decisionPackets.flatMap((packet) => packet.payload.inputIds),
      )
      runtime.inflightInputs = runtime.inflightInputs.filter(
        (input) => !consumed.has(input.id),
      )
      buffer.inputs = buffer.inputs.filter((input) => !consumed.has(input.id))
    }
    const hasInputs = buffer.inputs.length > 0
    const hasResults = buffer.results.length > 0
    const debounceReady =
      hasInputs && now - buffer.lastInputAt >= runtime.config.teller.debounceMs
    const resultsReady =
      hasResults &&
      !hasInputs &&
      now - buffer.firstResultAt >= runtime.config.thinker.maxResultWaitMs
    if ((debounceReady || resultsReady) && (hasInputs || hasResults)) {
      const history = await readHistory(runtime.paths.history)
      const digest = await runTellerDigest({
        workDir: runtime.config.workDir,
        inputs: buffer.inputs,
        results: buffer.results,
        tasks: runtime.tasks,
        history,
        timeoutMs: Math.max(5_000, runtime.config.teller.pollMs * 20),
        model: runtime.config.teller.model,
        modelReasoningEffort: runtime.config.teller.modelReasoningEffort,
      })
      await publishTellerDigest({
        paths: runtime.paths,
        payload: digest,
      })
      clearTellerBuffer(buffer)
    }
    await sleep(runtime.config.teller.pollMs)
  }
}
