import { nowIso, sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import {
  consumeThinkerDecisions,
  consumeUserInputs,
  consumeWorkerResults,
  publishTellerDigest,
} from '../streams/channels.js'
import { formatDecisionForUser, runTellerDigest } from '../teller/runner.js'

import { clearTellerBuffer, createTellerBuffer } from './teller-buffer.js'

import type { RuntimeState } from './runtime-state.js'

export const tellerLoop = async (runtime: RuntimeState): Promise<void> => {
  const buffer = createTellerBuffer()
  while (!runtime.stopped) {
    const now = Date.now()
    const inputPackets = await consumeUserInputs({
      paths: runtime.paths,
      fromCursor: runtime.channels.tellerUserInputCursor,
      limit: 100,
    })
    if (inputPackets.length > 0) {
      for (const packet of inputPackets) {
        buffer.inputs.push(packet.payload)
        runtime.channels.tellerUserInputCursor = packet.cursor
      }
      buffer.lastInputAt = now
    }
    const resultPackets = await consumeWorkerResults({
      paths: runtime.paths,
      fromCursor: runtime.channels.tellerWorkerResultCursor,
      limit: 100,
    })
    if (resultPackets.length > 0) {
      for (const packet of resultPackets) {
        buffer.results.push(packet.payload)
        runtime.channels.tellerWorkerResultCursor = packet.cursor
      }
      if (buffer.firstResultAt === 0) buffer.firstResultAt = now
    }
    const decisionPackets = await consumeThinkerDecisions({
      paths: runtime.paths,
      fromCursor: runtime.channels.tellerThinkerDecisionCursor,
      limit: 20,
    })
    if (decisionPackets.length > 0) {
      const history = await readHistory(runtime.paths.history)
      for (const packet of decisionPackets) {
        runtime.channels.tellerThinkerDecisionCursor = packet.cursor
        const responseText = await formatDecisionForUser({
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
          text: responseText,
          createdAt: nowIso(),
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
