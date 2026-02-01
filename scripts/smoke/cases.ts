import type { CaseResult } from './types.js'

import { fetchTasks, postInput, resolveUserCreatedAt, waitForAgentMatch } from './http.js'
import { runLlmValidation } from './llm.js'
import { clamp, sleep, truncate } from './utils.js'

type LlmCaseConfig = {
  enabled: boolean
  workDir: string
  model?: string
  timeoutMs: number
  criteria: string
  context?: string
}

export const evalContainsNumbers = (text: string, nums: number[]) => {
  const missing = nums.filter((n) => !text.includes(String(n)))
  if (missing.length > 0)
    return { ok: false, reason: `missing numbers: ${missing.join(',')}` }
  return { ok: true }
}

export const evalContainsEither = (text: string, options: string[]) => {
  const ok = options.some((opt) => text.includes(opt))
  return ok ? { ok: true } : { ok: false, reason: 'missing expected keyword' }
}

export const runSimpleCase = async (params: {
  id: string
  name: string
  prompt: string
  baseUrl: string
  token: string
  timeoutMs: number
  evalFn: (text: string) => { ok: boolean; reason?: string }
  attempts?: number
  llm?: LlmCaseConfig
}): Promise<CaseResult> => {
  const maxAttempts = Math.max(1, params.attempts ?? 2)
  let lastFailure: CaseResult | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const userId = await postInput({
      baseUrl: params.baseUrl,
      token: params.token,
      text: params.prompt,
    })
    const agent = await waitForAgentMatch({
      baseUrl: params.baseUrl,
      token: params.token,
      userId,
      timeoutMs: params.timeoutMs,
    })
    const latencyMs =
      Date.parse(agent.createdAt) -
      Date.parse(
        await resolveUserCreatedAt({
          baseUrl: params.baseUrl,
          token: params.token,
          userId,
        }),
      )
    const evalOutcome = params.evalFn(agent.text)
    const result: CaseResult = {
      id: params.id,
      name: params.name,
      ok: evalOutcome.ok,
      latencyMs: Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : undefined,
      tellerElapsedMs: agent.elapsedMs,
      usage: agent.usage,
      qualityScore: evalOutcome.ok ? 100 : 0,
      qualityReason: evalOutcome.ok ? undefined : evalOutcome.reason,
      responseSnippet: truncate(agent.text),
    }
    if (params.llm?.enabled) {
      const llmResult = await runLlmValidation({
        workDir: params.llm.workDir,
        model: params.llm.model,
        timeoutMs: params.llm.timeoutMs,
        caseId: params.id,
        criteria: params.llm.criteria,
        context: params.llm.context,
        prompt: params.prompt,
        response: agent.text,
      })
      result.llmValidation = llmResult
      result.qualityScore = llmResult.score
      if (!llmResult.pass) {
        result.ok = false
        result.qualityReason = result.qualityReason
          ? `${result.qualityReason}; llm: ${llmResult.reason}`
          : `llm: ${llmResult.reason}`
      }
    }
    if (evalOutcome.ok) return result
    lastFailure = result
    await sleep(300)
  }
  return lastFailure as CaseResult
}

export const runComplexCase = async (params: {
  baseUrl: string
  token: string
  timeoutMs: number
  llm?: LlmCaseConfig
}): Promise<CaseResult> => {
  const baseline = await fetchTasks({
    baseUrl: params.baseUrl,
    token: params.token,
    limit: 200,
  })
  const baselineIds = new Set(baseline.tasks.map((t) => t.id))

  const forceTag = '[[SMOKE_DELEGATE]]'
  const userPrompt =
    `Please read the local file src/scheduler/triggers.ts and summarize it in 3 ` +
    `short bullets. Include the function name "processTriggers" and mention ` +
    `"triggers.ts" in your reply. This requires reading the local repo, so ` +
    `delegate if needed. ${forceTag}`

  const userId = await postInput({
    baseUrl: params.baseUrl,
    token: params.token,
    text: userPrompt,
  })

  const taskDiscoveryStart = Date.now()
  let newTaskId: string | null = null
  while (
    Date.now() - taskDiscoveryStart <
    clamp(params.timeoutMs / 2, 20000, params.timeoutMs)
  ) {
    const tasks = await fetchTasks({
      baseUrl: params.baseUrl,
      token: params.token,
      limit: 200,
    })
    const found = tasks.tasks.find((task) => !baselineIds.has(task.id))
    if (found) {
      newTaskId = found.id
      break
    }
    await sleep(500)
  }

  const agent = await waitForAgentMatch({
    baseUrl: params.baseUrl,
    token: params.token,
    userId,
    timeoutMs: params.timeoutMs,
    predicate: (msg) =>
      msg.text.includes('triggers.ts') &&
      msg.text.includes('processTriggers'),
  })
  const userCreatedAt = await resolveUserCreatedAt({
    baseUrl: params.baseUrl,
    token: params.token,
    userId,
  })
  const latencyMs = Date.parse(agent.createdAt) - Date.parse(userCreatedAt)
  const mentionsExpected =
    agent.text.includes('triggers.ts') &&
    agent.text.includes('processTriggers')
  const replyFound = Boolean(agent.text && agent.text.trim().length > 0)
  const score = (newTaskId ? 50 : 0) + (mentionsExpected ? 50 : 0)
  const ok = Boolean(newTaskId && mentionsExpected)
  const reasons = []
  if (!newTaskId) reasons.push('no delegated task detected')
  if (!replyFound) reasons.push('missing reply')
  if (!mentionsExpected) reasons.push('reply missing expected keywords')
  const result: CaseResult = {
    id: 'C4',
    name: 'full-pipeline-complex',
    ok,
    latencyMs: Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : undefined,
    tellerElapsedMs: agent.elapsedMs,
    usage: agent.usage,
    qualityScore: score,
    qualityReason: reasons.length > 0 ? reasons.join('; ') : undefined,
    responseSnippet: truncate(agent.text),
  }
  if (params.llm?.enabled) {
    const llmResult = await runLlmValidation({
      workDir: params.llm.workDir,
      model: params.llm.model,
      timeoutMs: params.llm.timeoutMs,
      caseId: 'C4',
      criteria: params.llm.criteria,
      context: params.llm.context,
      prompt: userPrompt,
      response: agent.text,
    })
    result.llmValidation = llmResult
    result.qualityScore = llmResult.score
    if (!llmResult.pass) {
      result.ok = false
      result.qualityReason = result.qualityReason
        ? `${result.qualityReason}; llm: ${llmResult.reason}`
        : `llm: ${llmResult.reason}`
    }
  }
  return result
}
