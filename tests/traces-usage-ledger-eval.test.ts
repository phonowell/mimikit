import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { runTraceUsageLedgerEval } from '../scripts/traces-usage-ledger-eval-core.js'

test('runTraceUsageLedgerEval passes on committed regression samples', async () => {
  const report = await runTraceUsageLedgerEval({
    manifestPath: 'tests/fixtures/traces-usage-ledger-eval/manifest.json',
  })

  expect(report.passed).toBe(true)
  expect(report.requiredMatched).toBe(15)
  expect(report.requiredTotal).toBe(15)
  expect(report.scenarioCoverage).toEqual([
    { scenario: 'paused_resume_flow', total: 5, matched: 5 },
    { scenario: 'repeated_action_rejection', total: 5, matched: 5 },
    { scenario: 'usage_prompt_observation', total: 5, matched: 5 },
  ])
})

test('runTraceUsageLedgerEval reports sample id and artifact on mismatch', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'mimikit-traces-eval-'))
  try {
    await cp('tests/fixtures/traces-usage-ledger-eval', tempDir, {
      recursive: true,
    })
    const manifestPath = join(tempDir, 'manifest.json')
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as {
      version: string
      samples: Array<Record<string, unknown>>
    }
    const first = manifest.samples[0]
    if (!first || typeof first !== 'object')
      throw new Error('missing first sample')
    const expected = first.expected as {
      trace?: { header?: Record<string, string> }
    }
    expected.trace = {
      ...expected.trace,
      header: {
        ...(expected.trace?.header ?? {}),
        role: 'manager',
      },
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )

    const report = await runTraceUsageLedgerEval({ manifestPath })
    const failure = report.details.find(
      (detail) => detail.id === 'sample-pause-01',
    )

    expect(report.passed).toBe(false)
    expect(failure?.matched).toBe(false)
    expect(failure?.reasons[0]).toContain('trace.header.role')
    expect(failure?.artifacts.tracePath).toContain(
      'budget-pause-resume/trace.txt',
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
