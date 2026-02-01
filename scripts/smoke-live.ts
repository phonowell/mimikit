import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import {
  evalContainsEither,
  evalContainsNumbers,
  runComplexCase,
  runSimpleCase,
} from './smoke/cases.js'
import { waitForStatus } from './smoke/http.js'
import { loadReference } from './smoke/llm.js'
import { clamp, getFreePort, nowIso, sleep, sumUsage, toInt, truncate, withTimeout } from './smoke/utils.js'
import type { CaseResult, Report, Usage } from './smoke/types.js'

const run = async () => {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      model: { type: 'string' },
      'state-dir': { type: 'string' },
      'work-dir': { type: 'string' },
      'timeout-mins': { type: 'string' },
      cases: { type: 'string' },
      'llm-verify': { type: 'boolean' },
      'llm-verify-model': { type: 'string' },
    },
  })

  const rawCases =
    values.cases?.trim() || process.env.MIMIKIT_SMOKE_CASES?.trim() || ''
  const normalizeCase = (value: string) => value.trim().toUpperCase()
  const resolveCaseSet = (raw: string): Set<string> | null => {
    if (!raw) return null
    const lowered = raw.toLowerCase()
    if (lowered === 'basic') return new Set(['C1', 'C2', 'C3'])
    if (lowered === 'full') return new Set(['C1', 'C2', 'C3', 'C4'])
    const items = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeCase)
    return items.length > 0 ? new Set(items) : null
  }
  const caseFilter = resolveCaseSet(rawCases)

  const timeoutMins = toInt(values['timeout-mins'], 15)
  const globalTimeoutMs = clamp(timeoutMins, 1, 60) * 60 * 1000
  const startTime = Date.now()

  const port =
    values.port && values.port.trim().length > 0
      ? Number.parseInt(values.port, 10)
      : await getFreePort()
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid port: ${values.port}`)
  }

  const model = values.model?.trim() || undefined
  const workDir = resolve(values['work-dir'] ?? '.')
  const llmVerifyEnabled =
    Boolean(values['llm-verify']) ||
    process.env.MIMIKIT_SMOKE_LLM_VERIFY === '1'
  const triggersSource = llmVerifyEnabled
    ? await loadReference(resolve(workDir, 'src/scheduler/triggers.ts'))
    : undefined
  const llmVerifyModel =
    values['llm-verify-model']?.trim() ||
    process.env.MIMIKIT_SMOKE_LLM_VERIFY_MODEL ||
    model
  const llmConfig = {
    enabled: llmVerifyEnabled,
    workDir,
    model: llmVerifyModel,
    timeoutMs: 60000,
  }
  const stateDir = resolve(values['state-dir'] ?? '.mimikit-smoke')
  const apiToken =
    process.env.MIMIKIT_API_KEY ?? `smoke-${randomBytes(4).toString('hex')}`
  const baseUrl = `http://127.0.0.1:${port}`

  await rm(stateDir, { recursive: true, force: true })

  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      resolve('src/cli.ts'),
      '--port',
      String(port),
      '--state-dir',
      stateDir,
      '--work-dir',
      workDir,
      ...(model ? ['--model', model] : []),
    ],
    {
      cwd: resolve('.'),
      env: {
        ...process.env,
        MIMIKIT_API_KEY: apiToken,
        MIMIKIT_SMOKE_DELEGATE_TAG: '[[SMOKE_DELEGATE]]',
        MIMIKIT_PLANNER_FALLBACK: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let childOut = ''
  let childErr = ''
  child.stdout?.on('data', (chunk) => {
    childOut += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    childErr += String(chunk)
  })

  const cleanup = async () => {
    if (child.killed) return
    child.kill('SIGTERM')
    await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
    if (!child.killed) child.kill('SIGKILL')
  }

  const cases: CaseResult[] = []
  let report: Report | null = null
  try {
    await withTimeout(
      waitForStatus({
        baseUrl,
        token: apiToken,
        timeoutMs: 30000,
      }),
      35000,
      'status check timeout',
    )

    if (!caseFilter || caseFilter.has('C1')) {
      cases.push(
        await runSimpleCase({
          id: 'C1',
          name: 'math-sum',
          baseUrl,
          token: apiToken,
          timeoutMs: 120000,
          prompt:
            'Smoke test. Return only the numeric result of 3+4. No extra text.',
          evalFn: (text) => evalContainsNumbers(text, [7]),
          llm: {
            ...llmConfig,
            criteria:
              'Answer must clearly state 3+4=7. Must include "7" and may include "3" and "4" only; no other numbers. Keep it short (<=20 chars) and avoid extra reasoning.',
          },
        }),
      )
    }

    if (!caseFilter || caseFilter.has('C2')) {
      cases.push(
        await runSimpleCase({
          id: 'C2',
          name: 'math-product',
          baseUrl,
          token: apiToken,
          timeoutMs: 120000,
          prompt:
            'Smoke test. Return only the numeric result of 6*7. No extra text.',
          evalFn: (text) => evalContainsNumbers(text, [42]),
          llm: {
            ...llmConfig,
            criteria:
              'Answer must clearly state 6*7=42. Must include "42" and may include "6" and "7" only; no other numbers. Keep it short (<=20 chars) and avoid extra reasoning.',
          },
        }),
      )
    }

    if (!caseFilter || caseFilter.has('C3')) {
      cases.push(
        await runSimpleCase({
          id: 'C3',
          name: 'translation',
          baseUrl,
          token: apiToken,
          timeoutMs: 120000,
          prompt:
            "Smoke test. Return only the ASCII pinyin for 'hello' (ni hao/nihao). No extra text.",
          evalFn: (text) => evalContainsEither(text, ['ni hao', 'nihao']),
          llm: {
            ...llmConfig,
            criteria:
              "Answer must be ASCII-only pinyin for 'hello': 'ni hao' or 'nihao'. No Chinese characters, no extra words, and no punctuation beyond an optional space.",
          },
        }),
      )
    }

    if (!caseFilter || caseFilter.has('C4')) {
      cases.push(
        await runComplexCase({
          baseUrl,
          token: apiToken,
          timeoutMs: 240000,
          llm: {
            ...llmConfig,
            criteria:
              'Response must be 2-3 bullet points, mention "triggers.ts" and "processTriggers", and be consistent with the reference file. It should cover at least 3 key behaviors from the file (e.g. stuck/running normalization, recurring interval scheduling updates, scheduled runAt handling/removal, condition evaluation including llm_eval, nextRunAt/nextWakeAt updates). Penalize inaccuracies or fabricated behavior.',
            context: triggersSource
              ? `File: src/scheduler/triggers.ts\n${triggersSource}`
              : undefined,
          },
        }),
      )
    }

    const durationMs = Date.now() - startTime
    if (durationMs > globalTimeoutMs) {
      throw new Error('global timeout exceeded')
    }

    const passed = cases.filter((c) => c.ok).length
    const failed = cases.length - passed
    const totalUsage: Usage = {}
    let totalLatency = 0
    let latencyCount = 0
    for (const entry of cases) {
      sumUsage(totalUsage, entry.usage)
      if (Number.isFinite(entry.latencyMs ?? NaN)) {
        totalLatency += entry.latencyMs ?? 0
        latencyCount += 1
      }
    }

    report = {
      startedAt: new Date(startTime).toISOString(),
      endedAt: nowIso(),
      durationMs,
      config: { port, stateDir, workDir, model },
      cases,
      totals: {
        passed,
        failed,
        avgLatencyMs:
          latencyCount > 0 ? Math.round(totalLatency / latencyCount) : undefined,
        usage: totalUsage,
      },
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    cases.push({
      id: 'fatal',
      name: 'runner',
      ok: false,
      error: reason,
      responseSnippet: truncate(childErr || childOut),
    })
    report = {
      startedAt: new Date(startTime).toISOString(),
      endedAt: nowIso(),
      durationMs: Date.now() - startTime,
      config: { port, stateDir, workDir, model },
      cases,
      totals: {
        passed: cases.filter((c) => c.ok).length,
        failed: cases.filter((c) => !c.ok).length,
        usage: {},
      },
    }
  } finally {
    await cleanup()
  }

  await mkdir(resolve('reports'), { recursive: true })
  const reportPath = resolve(
    'reports',
    `smoke-live-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const ok = report.cases.every((c) => c.ok)
  if (!ok) {
    console.error(`[smoke] failed; report: ${reportPath}`)
    process.exit(1)
  }
  console.log(`[smoke] ok; report: ${reportPath}`)
}

await run()
