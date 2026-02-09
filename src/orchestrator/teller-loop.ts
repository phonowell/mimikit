import { bestEffort } from '../log/safe.js'
import { nowIso, sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import {
  consumeThinkerDecisions,
  consumeUserInputs,
  pruneChannelBefore,
  publishTellerDigest,
} from '../streams/channels.js'
import { formatDecisionForUser, runTellerDigest } from '../teller/runner.js'

import type { RuntimeState } from './runtime-state.js'

type TellerBuffer = {
  inputs: RuntimeState['inflightInputs']
  lastInputAt: number
}

const createTellerBuffer = (): TellerBuffer => ({
  inputs: [],
  lastInputAt: 0,
})

const clearTellerBuffer = (buffer: TellerBuffer): void => {
  buffer.inputs = []
  buffer.lastInputAt = 0
}

const maybePruneTellerChannels = (runtime: RuntimeState): Promise<void> => {
  if (!runtime.config.channels.pruneEnabled) return Promise.resolve()
  const keepRecent = Math.max(1, runtime.config.channels.keepRecentPackets)
  const pruneOps: Promise<void>[] = []
  const userInputKeepFrom =
    runtime.channels.teller.userInputCursor - keepRecent + 1
  if (userInputKeepFrom > 1) {
    pruneOps.push(
      pruneChannelBefore({
        path: runtime.paths.userInputChannel,
        keepFromCursor: userInputKeepFrom,
      }),
    )
  }
  const decisionKeepFrom =
    runtime.channels.teller.thinkerDecisionCursor - keepRecent + 1
  if (decisionKeepFrom > 1) {
    pruneOps.push(
      pruneChannelBefore({
        path: runtime.paths.thinkerDecisionChannel,
        keepFromCursor: decisionKeepFrom,
      }),
    )
  }
  if (pruneOps.length === 0) return Promise.resolve()
  return Promise.all(pruneOps).then(() => undefined)
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
      await bestEffort('pruneChannels: teller_decisions', () =>
        maybePruneTellerChannels(runtime),
      )
    }
    const hasInputs = buffer.inputs.length > 0
    const debounceReady =
      hasInputs && now - buffer.lastInputAt >= runtime.config.teller.debounceMs
    if (debounceReady) {
      const history = await readHistory(runtime.paths.history)
      const digest = await runTellerDigest({
        workDir: runtime.config.workDir,
        inputs: buffer.inputs,
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
      await bestEffort('pruneChannels: teller_digest', () =>
        maybePruneTellerChannels(runtime),
      )
    }
    await sleep(runtime.config.teller.pollMs)
  }
}
