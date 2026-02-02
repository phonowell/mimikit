import { extractToolCalls, stripToolCalls } from '../llm/output.js'
import { plannerOutputSchema, tellerOutputSchema } from '../llm/schemas.js'
import { runCodexSdk } from '../llm/sdk-runner.js'
import { appendLog } from '../log/append.js'
import { writeLlmOutput } from '../log/llm-output.js'
import { safe } from '../log/safe.js'
import { executeTool } from '../tools/execute.js'

import {
  buildPlannerPrompt,
  buildTellerPrompt,
  buildWorkerPrompt,
  type PromptMode,
} from './prompt.js'

import type { MemoryHit } from '../memory/search.js'
import type { ToolContext } from '../tools/context.js'
import type { HistoryMessage } from '../types/history.js'
import type { TellerEvent } from '../types/teller.js'
import type { ToolCall } from '../types/tools.js'

const resolveContextPromptMode = (params: {
  history: HistoryMessage[]
  memory: MemoryHit[]
  injectContext: boolean
}): PromptMode => {
  if (!params.injectContext) return 'minimal'
  return params.history.length > 0 || params.memory.length > 0
    ? 'full'
    : 'minimal'
}

export const runTeller = async (params: {
  ctx: ToolContext
  history: HistoryMessage[]
  memory: MemoryHit[]
  inputs: string[]
  events: TellerEvent[]
  model?: string
  timeoutMs: number
  injectContext?: boolean
}) => {
  const injectContext = params.injectContext ?? true
  const promptMode = resolveContextPromptMode({
    history: params.history,
    memory: params.memory,
    injectContext,
  })
  const prompt = await buildTellerPrompt({
    workDir: params.ctx.workDir,
    history: injectContext ? params.history : [],
    memory: injectContext ? params.memory : [],
    inputs: params.inputs,
    events: params.events,
    promptMode,
  })
  const promptLines = prompt.split(/\r?\n/).length
  const startedAt = Date.now()
  let llmResult: Awaited<ReturnType<typeof runCodexSdk>>
  try {
    llmResult = await runCodexSdk({
      role: 'teller',
      prompt,
      workDir: params.ctx.workDir,
      timeoutMs: params.timeoutMs,
      outputSchema: tellerOutputSchema,
      logPath: params.ctx.paths.log,
      logContext: {
        promptMode,
        historyCount: params.history.length,
        memoryCount: params.memory.length,
        inputsCount: params.inputs.length,
        eventsCount: params.events.length,
        injectContext,
      },
      ...(params.model ? { model: params.model } : {}),
    })
  } catch (error) {
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const err = error instanceof Error ? error : new Error(String(error))
    const aborted = err.name === 'AbortError' || /aborted/i.test(err.message)
    const retryOnError = process.env.MIMIKIT_TELLER_RETRY_ON_ERROR === '1'
    const retryEnabled =
      process.env.MIMIKIT_TELLER_RETRY_MINIMAL !== '0' &&
      (aborted || retryOnError)
    const retryTimeoutEnv = Number(process.env.MIMIKIT_TELLER_RETRY_TIMEOUT_MS)
    const retryTimeoutMs =
      Number.isFinite(retryTimeoutEnv) && retryTimeoutEnv > 0
        ? Math.min(params.timeoutMs, retryTimeoutEnv)
        : Math.min(params.timeoutMs, 30_000)

    if (retryEnabled) {
      await safe(
        'appendLog: llm_retry_started (teller)',
        () =>
          appendLog(params.ctx.paths.log, {
            event: 'llm_retry_started',
            role: params.ctx.role,
            reason: err.message,
            aborted,
            elapsedMs,
            timeoutMs: params.timeoutMs,
            retryTimeoutMs,
            promptMode,
            promptChars: prompt.length,
            promptLines,
            historyCount: params.history.length,
            memoryCount: params.memory.length,
            inputsCount: params.inputs.length,
            eventsCount: params.events.length,
            injectContext,
            ...(params.model ? { model: params.model } : {}),
          }),
        { fallback: undefined },
      )
      try {
        const retryPrompt = await buildTellerPrompt({
          workDir: params.ctx.workDir,
          history: params.history,
          memory: params.memory,
          inputs: params.inputs,
          events: params.events,
          promptMode: 'minimal',
        })
        llmResult = await runCodexSdk({
          role: 'teller',
          prompt: retryPrompt,
          workDir: params.ctx.workDir,
          timeoutMs: retryTimeoutMs,
          outputSchema: tellerOutputSchema,
          logPath: params.ctx.paths.log,
          logContext: {
            promptMode: 'minimal',
            historyCount: params.history.length,
            memoryCount: params.memory.length,
            inputsCount: params.inputs.length,
            eventsCount: params.events.length,
            injectContext,
            retryAttempt: 1,
          },
          ...(params.model ? { model: params.model } : {}),
        })
        await safe(
          'appendLog: llm_retry_finished (teller)',
          () =>
            appendLog(params.ctx.paths.log, {
              event: 'llm_retry_finished',
              role: params.ctx.role,
              elapsedMs: llmResult.elapsedMs,
              ...(llmResult.usage ? { usage: llmResult.usage } : {}),
            }),
          { fallback: undefined },
        )
      } catch (retryError) {
        const retryErr =
          retryError instanceof Error
            ? retryError
            : new Error(String(retryError))
        const trimmedRetry = retryErr.stack
          ? retryErr.stack.split(/\r?\n/).slice(0, 6).join('\n')
          : undefined
        await safe(
          'appendLog: llm_retry_failed (teller)',
          () =>
            appendLog(params.ctx.paths.log, {
              event: 'llm_retry_failed',
              role: params.ctx.role,
              error: retryErr.message,
              errorName: retryErr.name,
              ...(trimmedRetry ? { errorStack: trimmedRetry } : {}),
            }),
          { fallback: undefined },
        )
        const trimmedStack = err.stack
          ? err.stack.split(/\r?\n/).slice(0, 6).join('\n')
          : undefined
        await safe(
          'appendLog: llm_error (teller)',
          () =>
            appendLog(params.ctx.paths.log, {
              event: 'llm_error',
              role: params.ctx.role,
              error: err.message,
              errorName: err.name,
              ...(trimmedStack ? { errorStack: trimmedStack } : {}),
              aborted,
              elapsedMs,
              timeoutMs: params.timeoutMs,
              promptMode,
              promptChars: prompt.length,
              promptLines,
              historyCount: params.history.length,
              memoryCount: params.memory.length,
              inputsCount: params.inputs.length,
              eventsCount: params.events.length,
              injectContext,
              ...(params.model ? { model: params.model } : {}),
            }),
          { fallback: undefined },
        )
        const failureReplyDisabled =
          process.env.MIMIKIT_TELLER_FAILURE_REPLY_DISABLED === '1'
        if (!failureReplyDisabled) {
          const textOverride = process.env.MIMIKIT_TELLER_FAILURE_REPLY?.trim()
          const text =
            textOverride && textOverride.length > 0
              ? textOverride
              : '系统暂时不可用，请稍后再试。'
          const fallback: ToolCall = { tool: 'reply', args: { text } }
          const toolCtx: ToolContext = {
            ...params.ctx,
            llmElapsedMs: elapsedMs,
          }
          await executeTool(toolCtx, fallback)
          await safe(
            'appendLog: teller_response (fallback)',
            () =>
              appendLog(params.ctx.paths.log, {
                event: 'teller_response',
                toolCalls: 1,
                fallbackUsed: true,
                forcedDelegate: false,
                outputChars: 0,
                elapsedMs,
              }),
            { fallback: undefined },
          )
          return { calls: [fallback], output: '', elapsedMs }
        }
        throw error
      }
    } else {
      const trimmedStack = err.stack
        ? err.stack.split(/\r?\n/).slice(0, 6).join('\n')
        : undefined
      await safe(
        'appendLog: llm_error (teller)',
        () =>
          appendLog(params.ctx.paths.log, {
            event: 'llm_error',
            role: params.ctx.role,
            error: err.message,
            errorName: err.name,
            ...(trimmedStack ? { errorStack: trimmedStack } : {}),
            aborted,
            elapsedMs,
            timeoutMs: params.timeoutMs,
            promptMode,
            promptChars: prompt.length,
            promptLines,
            historyCount: params.history.length,
            memoryCount: params.memory.length,
            inputsCount: params.inputs.length,
            eventsCount: params.events.length,
            injectContext,
            ...(params.model ? { model: params.model } : {}),
          }),
        { fallback: undefined },
      )
      const failureReplyDisabled =
        process.env.MIMIKIT_TELLER_FAILURE_REPLY_DISABLED === '1'
      if (!failureReplyDisabled) {
        const textOverride = process.env.MIMIKIT_TELLER_FAILURE_REPLY?.trim()
        const text =
          textOverride && textOverride.length > 0
            ? textOverride
            : '系统暂时不可用，请稍后再试。'
        const fallback: ToolCall = { tool: 'reply', args: { text } }
        const toolCtx: ToolContext = {
          ...params.ctx,
          llmElapsedMs: elapsedMs,
        }
        await executeTool(toolCtx, fallback)
        await safe(
          'appendLog: teller_response (fallback)',
          () =>
            appendLog(params.ctx.paths.log, {
              event: 'teller_response',
              toolCalls: 1,
              fallbackUsed: true,
              forcedDelegate: false,
              outputChars: 0,
              elapsedMs,
            }),
          { fallback: undefined },
        )
        return { calls: [fallback], output: '', elapsedMs }
      }
      throw error
    }
  }
  const { output, usage, elapsedMs } = llmResult
  const outputPath = await writeLlmOutput({
    dir: params.ctx.paths.llmDir,
    role: params.ctx.role,
    output,
  })
  await appendLog(params.ctx.paths.log, {
    event: 'llm_activity',
    role: params.ctx.role,
    outputPath,
    elapsedMs,
    ...(usage ? { usage } : {}),
  })
  const toolCtx: ToolContext = {
    ...params.ctx,
    ...(usage !== undefined ? { llmUsage: usage } : {}),
    llmElapsedMs: elapsedMs,
  }
  const calls = extractToolCalls(output)
  const forceTag = process.env.MIMIKIT_SMOKE_DELEGATE_TAG?.trim()
  const forceDelegate =
    Boolean(forceTag) &&
    params.inputs.some((input) => input.includes(forceTag as string))
  let forcedDelegateUsed = false
  if (forceDelegate && !calls.some((call) => call.tool === 'delegate')) {
    const marker = forceTag as string
    const cleaned = params.inputs
      .map((input) => input.split(marker).join('').trim())
      .filter(Boolean)
      .join('\n')
    calls.unshift({
      tool: 'delegate',
      args: { prompt: cleaned || params.inputs.join('\n') },
    })
    forcedDelegateUsed = true
  }
  if (forceDelegate && !calls.some((call) => call.tool === 'reply')) {
    calls.push({ tool: 'reply', args: { text: 'Working on it.' } })
    forcedDelegateUsed = true
  }
  for (const call of calls) await executeTool(toolCtx, call)
  const stripped = stripToolCalls(output).trim()
  let fallbackUsed = false
  if (calls.length === 0) {
    const text = stripped || '（系统）未生成有效的工具调用，请重试。'
    const fallback: ToolCall = { tool: 'reply', args: { text } }
    await executeTool(toolCtx, fallback)
    calls.push(fallback)
    fallbackUsed = true
  }
  await appendLog(params.ctx.paths.log, {
    event: 'teller_response',
    toolCalls: calls.length,
    fallbackUsed,
    forcedDelegate: forcedDelegateUsed,
    outputChars: stripped.length,
    ...(usage ? { usage } : {}),
    elapsedMs,
  })
  return { calls, output: stripped, usage, elapsedMs }
}

export const runPlanner = async (params: {
  ctx: ToolContext
  history: HistoryMessage[]
  memory: MemoryHit[]
  request: string
  model?: string
  timeoutMs: number
  injectContext?: boolean
}) => {
  const injectContext = params.injectContext ?? true
  const promptMode = resolveContextPromptMode({
    history: params.history,
    memory: params.memory,
    injectContext,
  })
  const prompt = await buildPlannerPrompt({
    workDir: params.ctx.workDir,
    history: injectContext ? params.history : [],
    memory: injectContext ? params.memory : [],
    request: params.request,
    promptMode,
  })
  const promptLines = prompt.split(/\r?\n/).length
  const startedAt = Date.now()
  let llmResult: Awaited<ReturnType<typeof runCodexSdk>>
  try {
    llmResult = await runCodexSdk({
      role: 'planner',
      prompt,
      workDir: params.ctx.workDir,
      timeoutMs: params.timeoutMs,
      outputSchema: plannerOutputSchema,
      logPath: params.ctx.paths.log,
      logContext: {
        promptMode,
        historyCount: params.history.length,
        memoryCount: params.memory.length,
        injectContext,
      },
      ...(params.model ? { model: params.model } : {}),
    })
  } catch (error) {
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const err = error instanceof Error ? error : new Error(String(error))
    const trimmedStack = err.stack
      ? err.stack.split(/\r?\n/).slice(0, 6).join('\n')
      : undefined
    await safe(
      'appendLog: llm_error (planner)',
      () =>
        appendLog(params.ctx.paths.log, {
          event: 'llm_error',
          role: params.ctx.role,
          error: err.message,
          errorName: err.name,
          ...(trimmedStack ? { errorStack: trimmedStack } : {}),
          aborted: err.name === 'AbortError' || /aborted/i.test(err.message),
          elapsedMs,
          timeoutMs: params.timeoutMs,
          promptMode,
          promptChars: prompt.length,
          promptLines,
          historyCount: params.history.length,
          memoryCount: params.memory.length,
          injectContext,
          ...(params.model ? { model: params.model } : {}),
        }),
      { fallback: undefined },
    )
    throw error
  }
  const { output, usage, elapsedMs } = llmResult
  const calls = extractToolCalls(output)
  for (const call of calls) await executeTool(params.ctx, call)
  return {
    calls,
    output,
    rawOutput: output,
    usage,
    elapsedMs,
  }
}

export const runWorker = async (params: {
  workDir: string
  taskPrompt: string
  model?: string
  timeoutMs: number
  logPath?: string
  logContext?: Record<string, unknown>
}) => {
  const promptMode: PromptMode = 'minimal'
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    taskPrompt: params.taskPrompt,
    promptMode,
  })
  const llmResult = await runCodexSdk({
    role: 'worker',
    prompt,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.logPath ? { logPath: params.logPath } : {}),
    logContext: {
      promptMode,
      ...(params.logContext ?? {}),
    },
    ...(params.model ? { model: params.model } : {}),
  })
  return {
    output: llmResult.output,
    usage: llmResult.usage,
    elapsedMs: llmResult.elapsedMs,
  }
}
