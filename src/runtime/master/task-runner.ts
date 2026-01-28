import { searchMemory } from '../../memory/search.js'
import { type SessionStore } from '../../session/store.js'
import { appendTaskRecord, type TaskRecord } from '../ledger.js'

import { buildSummary, normalizeMaxIterations } from './helpers.js'
import { failTask } from './task-failure.js'
import { runTaskLoop } from './task-loop.js'

import type { Config } from '../../config.js'

export type TaskRunnerContext = {
  config: Config
  sessionStore: SessionStore
  tasks: Map<string, TaskRecord>
  onTriggerFollowup?: (
    task: TaskRecord,
    reason: string,
    kind: 'failed' | 'issue',
  ) => Promise<void>
}

export const runTask = async (
  ctx: TaskRunnerContext,
  taskId: string,
): Promise<void> => {
  const task = ctx.tasks.get(taskId)
  if (task?.status !== 'queued' || task.prompt === undefined) return
  const { prompt } = task

  const now = new Date().toISOString()
  const trimmedVerifyCommand = task.verifyCommand?.trim()
  const verifyCommand =
    trimmedVerifyCommand && trimmedVerifyCommand.length > 0
      ? trimmedVerifyCommand
      : undefined
  const needsIterations = Boolean(verifyCommand)
  const maxIterations = needsIterations
    ? normalizeMaxIterations(task.maxIterations, ctx.config.maxIterations)
    : 1
  const {
    verifyCommand: _verifyCommand,
    maxIterations: _maxIterations,
    ...taskBase
  } = task
  const runningBase: TaskRecord = {
    ...taskBase,
    status: 'running',
    updatedAt: now,
    attempt: task.attempt ?? 0,
  }
  const running: TaskRecord = {
    ...runningBase,
    ...(verifyCommand ? { verifyCommand } : {}),
    ...(needsIterations ? { maxIterations } : {}),
  }
  await appendTaskRecord(ctx.config.stateDir, running)
  ctx.tasks.set(taskId, running)

  const session = ctx.sessionStore.ensure(running.sessionKey)
  const summary = buildSummary(prompt)
  if (summary) ctx.sessionStore.update(running.sessionKey, { summary })
  await ctx.sessionStore.flush()

  const resumePolicy = running.resume
  const existingSessionId = session.codexSessionId
  if (resumePolicy === 'always' && !existingSessionId) {
    const message = 'resume=always requires a sessionId, but none was found'
    if (ctx.onTriggerFollowup)
      await ctx.onTriggerFollowup(running, message, 'failed')
    await failTask(ctx.config, ctx.tasks, running, session, message, false)
    ctx.sessionStore.update(running.sessionKey, {})
    await ctx.sessionStore.flush()
    return
  }

  const memoryHits = await searchMemory(ctx.config, prompt)
  await runTaskLoop({
    config: ctx.config,
    sessionStore: ctx.sessionStore,
    tasks: ctx.tasks,
    running,
    prompt,
    resumePolicy,
    ...(existingSessionId === undefined ? {} : { existingSessionId }),
    ...(verifyCommand === undefined ? {} : { verifyCommand }),
    maxIterations,
    session,
    memoryHits,
    ...(ctx.onTriggerFollowup
      ? { onTriggerFollowup: ctx.onTriggerFollowup }
      : {}),
  })
}
