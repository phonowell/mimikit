import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { globExists, globMtime } from '../fs/glob.js'

import type { Condition, TaskStatus, TriggerState } from '../types/tasks.js'

export type EvalOutcome = {
  status: 'true' | 'false' | 'llm_eval'
  prompt?: string
  state: TriggerState
}

export type EvalContext = {
  workDir: string
  taskStatus: Record<string, TaskStatus>
}

const conditionPrompt = (condition: Condition): string =>
  condition.type === 'llm_eval'
    ? condition.params.prompt
    : `Evaluate condition: ${JSON.stringify(condition)}`

const evalFileChanged = async (
  ctx: EvalContext,
  condition: Extract<Condition, { type: 'file_changed' }>,
  state: TriggerState,
): Promise<EvalOutcome> => {
  const { path } = condition.params
  const nextState: TriggerState = { ...state }
  try {
    const hasGlob = /[*?[]/.test(path)
    const mtime = hasGlob
      ? await globMtime(ctx.workDir, path)
      : (await stat(join(ctx.workDir, path))).mtimeMs
    if (!mtime) return { status: 'false', state: nextState }
    if (!state.initialized) {
      nextState.initialized = true
      nextState.lastMtime = mtime
      return {
        status: condition.params.fireOnInit ? 'true' : 'false',
        state: nextState,
      }
    }
    if (!state.lastMtime || mtime > state.lastMtime) {
      nextState.lastMtime = mtime
      return { status: 'true', state: nextState }
    }
    return { status: 'false', state: nextState }
  } catch {
    return { status: 'false', state: nextState }
  }
}

const evalFileExists = async (
  ctx: EvalContext,
  condition: Extract<Condition, { type: 'file_exists' }>,
  state: TriggerState,
): Promise<EvalOutcome> => {
  const { path } = condition.params
  try {
    const hasGlob = /[*?[]/.test(path)
    if (hasGlob) {
      const exists = await globExists(ctx.workDir, path)
      return { status: exists ? 'true' : 'false', state }
    }
    await stat(join(ctx.workDir, path))
    return { status: 'true', state }
  } catch {
    return { status: 'false', state }
  }
}

const evalTaskStatus = (
  condition: Extract<Condition, { type: 'task_done' | 'task_failed' }>,
  state: TriggerState,
  taskStatus: Record<string, TaskStatus>,
): EvalOutcome => {
  const status = taskStatus[condition.params.taskId]
  if (!status) return { status: 'false', state }
  const expected = condition.type === 'task_done' ? 'done' : 'failed'
  if (status.status !== expected) return { status: 'false', state }
  if (state.lastSeenResultId === status.resultId)
    return { status: 'false', state }

  return {
    status: 'true',
    state: { ...state, lastSeenResultId: status.resultId },
  }
}

export const evaluateCondition = async (
  ctx: EvalContext,
  condition: Condition,
  state: TriggerState,
): Promise<EvalOutcome> => {
  if (condition.type === 'file_changed')
    return evalFileChanged(ctx, condition, state)
  if (condition.type === 'file_exists')
    return evalFileExists(ctx, condition, state)
  if (condition.type === 'task_done' || condition.type === 'task_failed')
    return evalTaskStatus(condition, state, ctx.taskStatus)
  if (condition.type === 'llm_eval')
    return { status: 'llm_eval', prompt: conditionPrompt(condition), state }

  const children = condition.params.conditions
  let nextState = state
  let pending = false
  for (const child of children) {
    const outcome = await evaluateCondition(ctx, child, nextState)
    nextState = outcome.state
    if (condition.type === 'and') {
      if (outcome.status === 'false')
        return { status: 'false', state: nextState }
      if (outcome.status === 'llm_eval') pending = true
    }
    if (condition.type === 'or') {
      if (outcome.status === 'true') return { status: 'true', state: nextState }
      if (outcome.status === 'llm_eval') pending = true
    }
  }
  if (pending) {
    return {
      status: 'llm_eval',
      prompt: conditionPrompt(condition),
      state: nextState,
    }
  }

  return {
    status: condition.type === 'and' ? 'true' : 'false',
    state: nextState,
  }
}
