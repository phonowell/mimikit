import { appendLesson } from '../../memory/lessons.js'
import { searchMemory } from '../../memory/search.js'
import { type SessionStore } from '../../session/store.js'
import { appendTaskRecord, type TaskRecord } from '../ledger.js'
import { appendMetric } from '../metrics.js'

import { normalizeMaxIterations, normalizeObjective } from './helpers.js'
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
    status: 'failed' | 'low-score',
  ) => Promise<void>
}

export const runTask = async (
  ctx: TaskRunnerContext,
  taskId: string,
): Promise<void> => {
  const task = ctx.tasks.get(taskId)
  if (task?.status !== 'queued' || task.prompt === undefined) return
  const { prompt } = task

  const startedAtMs = Date.now()
  const startedAtIso = new Date(startedAtMs).toISOString()
  const now = new Date().toISOString()
  const trimmedVerifyCommand = task.verifyCommand?.trim()
  const verifyCommand =
    trimmedVerifyCommand && trimmedVerifyCommand.length > 0
      ? trimmedVerifyCommand
      : undefined
  const trimmedScoreCommand = task.scoreCommand?.trim()
  const scoreCommand =
    trimmedScoreCommand && trimmedScoreCommand.length > 0
      ? trimmedScoreCommand
      : undefined
  const { minScore } = task
  const guardRequireClean =
    task.guardRequireClean ?? ctx.config.guardRequireClean
  const guardMaxChangedFiles =
    task.guardMaxChangedFiles ?? ctx.config.guardMaxChangedFiles
  const guardMaxChangedLines =
    task.guardMaxChangedLines ?? ctx.config.guardMaxChangedLines
  const objective = normalizeObjective(task.objective)
  const needsIterations = Boolean(verifyCommand ?? minScore !== undefined)
  const maxIterations = needsIterations
    ? normalizeMaxIterations(task.maxIterations, ctx.config.maxIterations)
    : 1
  const {
    verifyCommand: _verifyCommand,
    maxIterations: _maxIterations,
    scoreCommand: _scoreCommand,
    minScore: _minScore,
    objective: _objective,
    guardRequireClean: _guardRequireClean,
    guardMaxChangedFiles: _guardMaxChangedFiles,
    guardMaxChangedLines: _guardMaxChangedLines,
    ...taskBase
  } = task
  const runningBase: TaskRecord = {
    ...taskBase,
    status: 'running',
    updatedAt: now,
    attempt: task.attempt ?? 0,
    guardRequireClean,
    ...(objective ? { objective } : {}),
  }
  const running: TaskRecord = {
    ...runningBase,
    ...(verifyCommand ? { verifyCommand } : {}),
    ...(scoreCommand ? { scoreCommand } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    ...(guardMaxChangedFiles !== undefined ? { guardMaxChangedFiles } : {}),
    ...(guardMaxChangedLines !== undefined ? { guardMaxChangedLines } : {}),
    ...(needsIterations ? { maxIterations } : {}),
  }
  await appendTaskRecord(ctx.config.stateDir, running)
  ctx.tasks.set(taskId, running)

  const session = ctx.sessionStore.ensure(running.sessionKey)
  await ctx.sessionStore.flush()

  const resumePolicy = running.resume
  const existingSessionId = session.codexSessionId
  if (resumePolicy === 'always' && !existingSessionId) {
    const message = 'resume=always requires a sessionId, but none was found'
    await appendMetric(ctx.config.metricsPath, {
      taskId: running.id,
      runId: running.runId,
      sessionKey: running.sessionKey,
      status: 'failed',
      attempt: running.attempt ?? 0,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      error: message,
      ...(minScore !== undefined ? { minScore } : {}),
    })
    if (ctx.config.lessonsEnabled) {
      await appendLesson(ctx.config.lessonsPath, {
        ts: new Date().toISOString(),
        taskId: running.id,
        sessionKey: running.sessionKey,
        status: 'failed',
        reason: message,
        prompt,
        ...(objective ? { objective } : {}),
        ...(minScore !== undefined ? { minScore } : {}),
      })
    }
    if (ctx.onTriggerFollowup)
      await ctx.onTriggerFollowup(running, message, 'failed')
    await failTask(ctx.config, ctx.tasks, running, session, message, false)
    return
  }
  if (minScore !== undefined && !scoreCommand) {
    const message = 'minScore requires a scoreCommand, but none was found'
    await appendMetric(ctx.config.metricsPath, {
      taskId: running.id,
      runId: running.runId,
      sessionKey: running.sessionKey,
      status: 'failed',
      attempt: running.attempt ?? 0,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      error: message,
      minScore,
    })
    if (ctx.config.lessonsEnabled) {
      await appendLesson(ctx.config.lessonsPath, {
        ts: new Date().toISOString(),
        taskId: running.id,
        sessionKey: running.sessionKey,
        status: 'failed',
        reason: message,
        prompt,
        ...(objective ? { objective } : {}),
        minScore,
      })
    }
    if (ctx.onTriggerFollowup)
      await ctx.onTriggerFollowup(running, message, 'failed')
    await failTask(ctx.config, ctx.tasks, running, session, message, false)
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
    guardRequireClean,
    ...(existingSessionId === undefined ? {} : { existingSessionId }),
    ...(verifyCommand === undefined ? {} : { verifyCommand }),
    ...(scoreCommand === undefined ? {} : { scoreCommand }),
    ...(minScore === undefined ? {} : { minScore }),
    ...(objective === undefined ? {} : { objective }),
    ...(guardMaxChangedFiles === undefined ? {} : { guardMaxChangedFiles }),
    ...(guardMaxChangedLines === undefined ? {} : { guardMaxChangedLines }),
    maxIterations,
    startedAtMs,
    startedAtIso,
    session,
    memoryHits,
    ...(ctx.onTriggerFollowup
      ? { onTriggerFollowup: ctx.onTriggerFollowup }
      : {}),
  })
}
