import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { summarizeMetrics } from '../src/runtime/metrics.js'

const makeTempDir = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'mimikit-metrics-'))

describe('summarizeMetrics', () => {
  it('aggregates records', async () => {
    const dir = await makeTempDir()
    const metricsPath = path.join(dir, 'metrics.jsonl')
    const records = [
      {
        taskId: 't1',
        runId: 'r1',
        sessionKey: 's1',
        status: 'done',
        attempt: 1,
        startedAt: '2025-01-01T00:00:00Z',
        finishedAt: '2025-01-01T00:00:01Z',
        durationMs: 1000,
        score: 0.8,
      },
      {
        taskId: 't2',
        runId: 'r2',
        sessionKey: 's1',
        status: 'failed',
        attempt: 1,
        startedAt: '2025-01-01T00:00:02Z',
        finishedAt: '2025-01-01T00:00:05Z',
        durationMs: 3000,
      },
    ]
    await fs.writeFile(
      metricsPath,
      `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
      'utf8',
    )

    const summary = await summarizeMetrics(metricsPath)
    expect(summary.total).toBe(2)
    expect(summary.done).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.avgDurationMs).toBe(2000)
    expect(summary.successRate).toBe(0.5)
    expect(summary.avgScore).toBe(0.8)
    expect(summary.lastRunAt).toBe('2025-01-01T00:00:05Z')
  })
})
