import { invokeAction } from '../actions/registry/index.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import type { StandardStep } from './standard-step.js'

export type StandardActionStep = Extract<StandardStep, { kind: 'action' }>

export type StepExecutionRecord = {
  round: number
  action: string
  ok: boolean
  output: string
  error?: string
}

const summarizeActionCall = (params: {
  name: string
  args: unknown
  output: string
  ok: boolean
  error?: string
}): string =>
  [
    `action: ${params.name}`,
    `ok: ${params.ok}`,
    `args: ${JSON.stringify(params.args ?? {})}`,
    ...(params.error ? [`error: ${params.error}`] : []),
    `output:\n${params.output}`,
  ].join('\n')

const toPayload = (record: StepExecutionRecord): Record<string, unknown> => ({
  round: record.round,
  action: record.action,
  ok: record.ok,
  ...(record.error ? { error: record.error } : {}),
})

export const executeStandardStep = async (params: {
  stateDir: string
  taskId: string
  workDir: string
  round: number
  step: StandardActionStep
}): Promise<{ record: StepExecutionRecord; transcriptEntry: string }> => {
  const actionName = params.step.actionCall.name.trim()
  if (!actionName) throw new Error('standard_action_name_missing')

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'action_call_start',
    payload: {
      round: params.round,
      action: actionName,
      args: params.step.actionCall.args,
    },
  })

  const actionResult = await invokeAction(
    { workDir: params.workDir },
    actionName,
    params.step.actionCall.args,
  )

  const actionOutput =
    actionResult.output.length > 20_000
      ? `${actionResult.output.slice(0, 20_000)}\n...[truncated]`
      : actionResult.output

  const record: StepExecutionRecord = {
    round: params.round,
    action: actionName,
    ok: actionResult.ok,
    output: actionOutput,
    ...(actionResult.error ? { error: actionResult.error } : {}),
  }

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'action_call_end',
    payload: {
      round: params.round,
      action: actionName,
      ok: actionResult.ok,
      ...(actionResult.error ? { error: actionResult.error } : {}),
      record: toPayload(record),
    },
  })

  return {
    record,
    transcriptEntry: summarizeActionCall({
      name: actionName,
      args: params.step.actionCall.args,
      output: actionOutput,
      ok: actionResult.ok,
      ...(actionResult.error ? { error: actionResult.error } : {}),
    }),
  }
}
