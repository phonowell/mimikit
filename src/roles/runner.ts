import { extractToolCalls, stripToolCalls } from '../llm/output.js'
import { plannerOutputSchema, tellerOutputSchema } from '../llm/schemas.js'
import { runCodexSdk } from '../llm/sdk-runner.js'
import { appendLog } from '../log/append.js'
import { writeLlmOutput } from '../log/llm-output.js'
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
  const prompt = await buildTellerPrompt({
    workDir: params.ctx.workDir,
    history: injectContext ? params.history : [],
    memory: injectContext ? params.memory : [],
    inputs: params.inputs,
    events: params.events,
  })
  const llmResult = await runCodexSdk({
    role: 'teller',
    prompt,
    workDir: params.ctx.workDir,
    timeoutMs: params.timeoutMs,
    outputSchema: tellerOutputSchema,
    ...(params.model ? { model: params.model } : {}),
  })
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
  const prompt = await buildPlannerPrompt({
    workDir: params.ctx.workDir,
    history: injectContext ? params.history : [],
    memory: injectContext ? params.memory : [],
    request: params.request,
  })
  const llmResult = await runCodexSdk({
    role: 'planner',
    prompt,
    workDir: params.ctx.workDir,
    timeoutMs: params.timeoutMs,
    outputSchema: plannerOutputSchema,
    ...(params.model ? { model: params.model } : {}),
  })
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
}) => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    taskPrompt: params.taskPrompt,
  })
  const llmResult = await runCodexSdk({
    role: 'worker',
    prompt,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })
  return {
    output: llmResult.output,
    usage: llmResult.usage,
    elapsedMs: llmResult.elapsedMs,
  }
}
