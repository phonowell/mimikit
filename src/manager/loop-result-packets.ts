import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { taskResultSchema } from '../storage/runtime-snapshot-schema.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { PacketWithCursor } from '../streams/queue-checkpoint.js'
import type { QueueReadCheckpoint } from '../streams/queues.js'
import type { TaskResult } from '../types/index.js'

const formatIssuePath = (path: readonly PropertyKey[]): string => {
  if (path.length === 0) return '<root>'
  return path.map((segment) => String(segment)).join('.')
}

export const syncCheckpoint = (
  checkpoint: QueueReadCheckpoint,
  cursor: number,
): QueueReadCheckpoint =>
  checkpoint.cursor === cursor ? checkpoint : { cursor, byteOffset: 0 }

export const filterValidResultPackets = async (
  runtime: RuntimeState,
  packets: Array<PacketWithCursor<unknown>>,
): Promise<Array<PacketWithCursor<TaskResult>>> => {
  const resultPackets: Array<PacketWithCursor<TaskResult>> = []
  for (const packet of packets) {
    const parsedResult = taskResultSchema.safeParse(packet.payload)
    if (parsedResult.success) {
      resultPackets.push({
        ...packet,
        payload: parsedResult.data,
      })
      continue
    }
    await bestEffort('appendLog: invalid_worker_result_packet', () =>
      appendLog(runtime.paths.log, {
        event: 'invalid_worker_result_packet',
        packetId: packet.id,
        cursor: packet.cursor,
        issues: parsedResult.error.issues.map(
          (issue) => `${formatIssuePath(issue.path)}: ${issue.message}`,
        ),
      }),
    )
  }
  return resultPackets
}
