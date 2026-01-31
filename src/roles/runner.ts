import { extractToolCalls, stripToolCalls } from '../llm/output.js'
import { runCodex } from '../llm/runner.js'
import { appendLog } from '../log/append.js'
import { executeTool } from '../tools/execute.js'

import {
  buildPlannerPrompt,
  buildTellerPrompt,
  buildWorkerPrompt,
} from './prompt.js'

import type { MemoryHit } from '../memory/search.js'
import type { ToolContext } from '../tools/context.js'
import type { HistoryMessage } from '../types/history.js'
import type { TellerEvent } from '../types/teller.js'
import type { ToolCall } from '../types/tools.js'

const buildRunOptions = (params: {
  prompt: string
  workDir: string
  timeoutMs: number
  model?: string
  allowShell: boolean
}) => {
  if (params.model) {
    return {
      prompt: params.prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      model: params.model,
      allowShell: params.allowShell,
    }
  }
  return {
    prompt: params.prompt,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    allowShell: params.allowShell,
  }
}

export const runTeller = async (params: {
  ctx: ToolContext
  history: HistoryMessage[]
  memory: MemoryHit[]
  inputs: string[]
  events: TellerEvent[]
  model?: string
  timeoutMs: number
}) => {
  const prompt = await buildTellerPrompt({
    workDir: params.ctx.workDir,
    history: params.history,
    memory: params.memory,
    inputs: params.inputs,
    events: params.events,
  })
  const llmResult = await runCodex(
    buildRunOptions({
      prompt,
      workDir: params.ctx.workDir,
      timeoutMs: params.timeoutMs,
      allowShell: false,
      ...(params.model ? { model: params.model } : {}),
    }),
  )
  const { output, usage, elapsedMs } = llmResult
  await appendLog(params.ctx.paths.log, {
    event: 'llm_activity',
    role: params.ctx.role,
    elapsedMs,
    ...(usage ? { usage } : {}),
  })
  const toolCtx: ToolContext = {
    ...params.ctx,
    ...(usage !== undefined ? { llmUsage: usage } : {}),
    llmElapsedMs: elapsedMs,
  }
  const calls = extractToolCalls(output)
  for (const call of calls) await executeTool(toolCtx, call)
  const stripped = stripToolCalls(output).trim()
  let fallbackUsed = false
  if (calls.length === 0 && stripped) {
    const fallback: ToolCall = { tool: 'reply', args: { text: stripped } }
    await executeTool(toolCtx, fallback)
    calls.push(fallback)
    fallbackUsed = true
  }
  await appendLog(params.ctx.paths.log, {
    event: 'teller_response',
    toolCalls: calls.length,
    fallbackUsed,
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
}) => {
  const prompt = await buildPlannerPrompt({
    workDir: params.ctx.workDir,
    history: params.history,
    memory: params.memory,
    request: params.request,
  })
  const llmResult = await runCodex(
    buildRunOptions({
      prompt,
      workDir: params.ctx.workDir,
      timeoutMs: params.timeoutMs,
      allowShell: false,
      ...(params.model ? { model: params.model } : {}),
    }),
  )
  const { output, usage, elapsedMs } = llmResult
  const calls = extractToolCalls(output)
  for (const call of calls) await executeTool(params.ctx, call)
  return { calls, output: stripToolCalls(output), usage, elapsedMs }
}

export const runWorker = async (params: {
  workDir: string
  taskPrompt: string
  model?: string
  timeoutMs: number
}) => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    taskPrompt: params.taskPrompt,
  })
  const llmResult = await runCodex(
    buildRunOptions({
      prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      allowShell: true,
      ...(params.model ? { model: params.model } : {}),
    }),
  )
  return {
    output: llmResult.output,
    usage: llmResult.usage,
    elapsedMs: llmResult.elapsedMs,
  }
}
