import { invokeAction } from '../actions/registry/index.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import type { StandardActionCall } from './standard-step.js'

export type StepExecutionRecord = {
  round: number
  actionIndex?: number
  actionCount?: number
  action: string
  evidenceRef: string
  ok: boolean
  output: string
  error?: string
}

const summarizeActionCall = (params: {
  actionIndex?: number
  actionCount?: number
  name: string
  args: unknown
  evidenceRef: string
  output: string
  ok: boolean
  error?: string
}): string =>
  [
    `action: ${params.name}`,
    ...(params.actionIndex !== undefined && params.actionCount !== undefined
      ? [`action_index: ${params.actionIndex}/${params.actionCount}`]
      : []),
    `evidence_ref: ${params.evidenceRef}`,
    `ok: ${params.ok}`,
    `args: ${JSON.stringify(params.args ?? {})}`,
    ...(params.error ? [`error: ${params.error}`] : []),
    `output:\n${params.output}`,
  ].join('\n')

const toPayload = (record: StepExecutionRecord): Record<string, unknown> => ({
  round: record.round,
  ...(record.actionIndex !== undefined
    ? { actionIndex: record.actionIndex }
    : {}),
  ...(record.actionCount !== undefined
    ? { actionCount: record.actionCount }
    : {}),
  action: record.action,
  evidenceRef: record.evidenceRef,
  ok: record.ok,
  ...(record.error ? { error: record.error } : {}),
})

export const executeStandardStep = async (params: {
  stateDir: string
  taskId: string
  workDir: string
  round: number
  actionCall: StandardActionCall
  actionIndex?: number
  actionCount?: number
}): Promise<{ record: StepExecutionRecord; transcriptEntry: string }> => {
  const actionName = params.actionCall.name.trim()
  if (!actionName) throw new Error('standard_action_name_missing')

  const evidenceRef =
    params.actionIndex !== undefined
      ? `action:${params.round}.${params.actionIndex}`
      : `action:${params.round}`

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'action_call_start',
    payload: {
      round: params.round,
      ...(params.actionIndex !== undefined
        ? { actionIndex: params.actionIndex }
        : {}),
      ...(params.actionCount !== undefined
        ? { actionCount: params.actionCount }
        : {}),
      action: actionName,
      evidenceRef,
      args: params.actionCall.args,
    },
  })

  const actionResult = await invokeAction(
    { workDir: params.workDir },
    actionName,
    params.actionCall.args,
  )

  const actionOutput =
    actionResult.output.length > 20_000
      ? `${actionResult.output.slice(0, 20_000)}\n...[truncated]`
      : actionResult.output

  const record: StepExecutionRecord = {
    round: params.round,
    ...(params.actionIndex !== undefined
      ? { actionIndex: params.actionIndex }
      : {}),
    ...(params.actionCount !== undefined
      ? { actionCount: params.actionCount }
      : {}),
    action: actionName,
    evidenceRef,
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
      ...(params.actionIndex !== undefined
        ? { actionIndex: params.actionIndex }
        : {}),
      ...(params.actionCount !== undefined
        ? { actionCount: params.actionCount }
        : {}),
      action: actionName,
      evidenceRef,
      ok: actionResult.ok,
      ...(actionResult.error ? { error: actionResult.error } : {}),
      record: toPayload(record),
    },
  })

  return {
    record,
    transcriptEntry: summarizeActionCall({
      ...(params.actionIndex !== undefined
        ? { actionIndex: params.actionIndex }
        : {}),
      ...(params.actionCount !== undefined
        ? { actionCount: params.actionCount }
        : {}),
      name: actionName,
      args: params.actionCall.args,
      evidenceRef,
      output: actionOutput,
      ok: actionResult.ok,
      ...(actionResult.error ? { error: actionResult.error } : {}),
    }),
  }
}
