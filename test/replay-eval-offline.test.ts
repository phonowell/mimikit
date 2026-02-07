import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { runReplaySuite } from '../src/eval/replay-runner.js'
import { buildManagerPrompt } from '../src/roles/prompt.js'
import {
  appendLlmArchive,
  buildLlmArchiveLookupKey,
  type LlmArchiveLookup,
} from '../src/storage/llm-archive.js'

import type { ReplaySuite } from '../src/eval/replay-types.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-replay-offline-'))

const createSuite = (mustContain?: string): ReplaySuite => ({
  suite: 'replay-offline-suite',
  version: 1,
  cases: [
    {
      id: 'offline-case-1',
      history: [
        {
          id: 'u-1',
          role: 'user',
          text: '你好',
          createdAt: '2026-02-06T09:00:00.000Z',
        },
      ],
      inputs: [
        {
          id: 'u-2',
          text: '请简要回复',
          createdAt: '2026-02-06T09:00:01.000Z',
        },
      ],
      tasks: [],
      results: [],
      ...(mustContain
        ? {
            expect: {
              output: { mustContain: [mustContain] },
            },
          }
        : {}),
    },
  ],
})

test('runReplaySuite offline mode uses archive without llm call', async () => {
  const stateDir = await createTmpDir()
  const workDir = process.cwd()
  const output = '离线归档命中 OK'
  const suite = createSuite(output)
  const replayCase = suite.cases[0]
  if (!replayCase) throw new Error('replay case missing')

  const prompt = await buildManagerPrompt({
    stateDir,
    workDir,
    inputs: replayCase.inputs,
    results: replayCase.results,
    tasks: replayCase.tasks,
    history: replayCase.history,
  })

  const lookup: LlmArchiveLookup = {
    role: 'manager',
    attempt: 'primary',
    prompt,
    messages: [{ role: 'user', content: prompt }],
    toolSchema: null,
    toolInputs: null,
  }

  await appendLlmArchive(stateDir, {
    role: 'manager',
    attempt: 'primary',
    prompt,
    output,
    ok: true,
    requestKey: buildLlmArchiveLookupKey(lookup),
  })

  const report = await runReplaySuite({
    suite,
    stateDir,
    workDir,
    timeoutMs: 200,
    offline: true,
    maxFail: Number.MAX_SAFE_INTEGER,
  })

  expect(report.passed).toBe(1)
  expect(report.failed).toBe(0)
  const caseReport = report.cases[0]
  expect(caseReport?.status).toBe('passed')
  expect(caseReport?.source).toBe('archive')
  expect(caseReport?.usage.total).toBe(0)
  expect(report.metrics.archiveCases).toBe(1)
  expect(report.metrics.liveCases).toBe(0)
  expect(report.metrics.llmCalls).toBe(0)
})

test('runReplaySuite offline mode archive miss fails before openai auth', async () => {
  const stateDir = await createTmpDir()
  const report = await runReplaySuite({
    suite: createSuite(),
    stateDir,
    workDir: process.cwd(),
    timeoutMs: 200,
    offline: true,
    maxFail: Number.MAX_SAFE_INTEGER,
  })

  const error = report.cases[0]?.error ?? ''
  expect(report.cases[0]?.status).toBe('error')
  expect(report.metrics.llmCalls).toBe(0)
  expect(error.includes('[replay:eval] offline archive miss')).toBe(true)
  expect(error.includes('OPENAI_API_KEY is missing')).toBe(false)
})
