import { bestEffort } from '../log/safe.js'
import { sleep } from '../shared/utils.js'
import {
  consumeTellerDigests,
  consumeWorkerResults,
  pruneChannelsByCursor,
} from '../streams/channels.js'
import { buildTaskStatusSummary } from '../teller/task-summary.js'

import { runThinkerCycle } from './cycle.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult } from '../types/index.js'

const maybePruneThinkerChannels = (runtime: RuntimeState): Promise<void> =>
  pruneChannelsByCursor({
    enabled: runtime.config.channels.pruneEnabled,
    keepRecent: runtime.config.channels.keepRecentPackets,
    targets: [
      {
        path: runtime.paths.tellerDigestChannel,
        cursor: runtime.channels.thinker.tellerDigestCursor,
      },
      {
        path: runtime.paths.workerResultChannel,
        cursor: runtime.channels.thinker.workerResultCursor,
      },
    ],
  })

const mergeResultBatch = (items: TaskResult[]): TaskResult[] => {
  const byKey = new Map<string, TaskResult>()
  for (const item of items) {
    const key = `${item.taskId}:${item.completedAt}:${item.status}`
    byKey.set(key, item)
  }
  return [...byKey.values()]
}

export const thinkerLoop = async (runtime: RuntimeState): Promise<void> => {
  const bufferedResults: TaskResult[] = []
  let firstResultAt = 0
  while (!runtime.stopped) {
    const now = Date.now()
    const resultPackets = await consumeWorkerResults({
      paths: runtime.paths,
      fromCursor: runtime.channels.thinker.workerResultCursor,
      limit: 100,
    })
    if (resultPackets.length > 0) {
      for (const packet of resultPackets) {
        bufferedResults.push(packet.payload)
        runtime.channels.thinker.workerResultCursor = packet.cursor
      }
      if (firstResultAt === 0) firstResultAt = now
      await bestEffort('pruneChannels: thinker_result_ingest', () =>
        maybePruneThinkerChannels(runtime),
      )
    }

    const throttled =
      runtime.lastThinkerRunAt &&
      now - runtime.lastThinkerRunAt < runtime.config.thinker.minIntervalMs
    if (throttled) {
      await sleep(runtime.config.thinker.pollMs)
      continue
    }

    const packets = await consumeTellerDigests({
      paths: runtime.paths,
      fromCursor: runtime.channels.thinker.tellerDigestCursor,
      limit: 1,
    })
    const packet = packets[0]
    const resultsReady =
      bufferedResults.length > 0 &&
      now - firstResultAt >= runtime.config.thinker.maxResultWaitMs
    if (!packet && !resultsReady) {
      await sleep(runtime.config.thinker.pollMs)
      continue
    }

    if (packet) {
      runtime.channels.thinker.tellerDigestCursor = packet.cursor
      const merged = mergeResultBatch([
        ...bufferedResults,
        ...packet.payload.results,
      ])
      await runThinkerCycle(runtime, {
        ...packet.payload,
        results: merged,
      })
      bufferedResults.length = 0
      firstResultAt = 0
      await bestEffort('pruneChannels: thinker_digest_ingest', () =>
        maybePruneThinkerChannels(runtime),
      )
      continue
    }

    await runThinkerCycle(runtime, {
      digestId: `worker-result-${Date.now()}-${runtime.channels.thinker.workerResultCursor}`,
      summary: '',
      inputs: [],
      results: mergeResultBatch(bufferedResults),
      taskSummary: buildTaskStatusSummary(runtime.tasks),
    })
    bufferedResults.length = 0
    firstResultAt = 0
    await bestEffort('pruneChannels: thinker_result_only', () =>
      maybePruneThinkerChannels(runtime),
    )
  }
}
