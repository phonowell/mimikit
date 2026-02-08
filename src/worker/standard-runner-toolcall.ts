import { appendTaskProgress } from '../storage/task-progress.js'

import { runWorkerTool } from './tools/registry.js'

import type { StandardStep } from './standard-runner-step.js'

export type StandardToolStep = StandardStep & {
  action: 'tool'
  tool: {
    name: string
    args: Record<string, unknown>
  }
}

export type ToolExecutionRecord = {
  round: number
  tool: string
  ok: boolean
  output: string
  error?: string
}

const summarizeToolCall = (params: {
  name: string
  args: unknown
  output: string
  ok: boolean
  error?: string
}): string =>
  [
    `tool: ${params.name}`,
    `ok: ${params.ok}`,
    `args: ${JSON.stringify(params.args ?? {})}`,
    ...(params.error ? [`error: ${params.error}`] : []),
    `output:\n${params.output}`,
  ].join('\n')

const buildToolExecutionPayload = (
  record: ToolExecutionRecord,
): Record<string, unknown> => ({
  round: record.round,
  tool: record.tool,
  ok: record.ok,
  ...(record.error ? { error: record.error } : {}),
})

export const executeToolStep = async (params: {
  stateDir: string
  taskId: string
  workDir: string
  round: number
  step: StandardToolStep
}): Promise<{ record: ToolExecutionRecord; transcriptEntry: string }> => {
  const toolName = params.step.tool.name.trim()
  if (!toolName) throw new Error('standard_tool_name_missing')
  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'tool_call_start',
    payload: {
      round: params.round,
      tool: toolName,
      args: params.step.tool.args,
    },
  })
  const toolResult = await runWorkerTool(
    { workDir: params.workDir },
    toolName,
    params.step.tool.args,
  )
  const toolOutput =
    toolResult.output.length > 20_000
      ? `${toolResult.output.slice(0, 20_000)}\n...[truncated]`
      : toolResult.output
  const record: ToolExecutionRecord = {
    round: params.round,
    tool: toolName,
    ok: toolResult.ok,
    output: toolOutput,
    ...(toolResult.error ? { error: toolResult.error } : {}),
  }
  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'tool_call_end',
    payload: {
      round: params.round,
      tool: toolName,
      ok: toolResult.ok,
      ...(toolResult.error ? { error: toolResult.error } : {}),
      record: buildToolExecutionPayload(record),
    },
  })
  return {
    record,
    transcriptEntry: summarizeToolCall({
      name: toolName,
      args: params.step.tool.args,
      output: toolOutput,
      ok: toolResult.ok,
      ...(toolResult.error ? { error: toolResult.error } : {}),
    }),
  }
}
