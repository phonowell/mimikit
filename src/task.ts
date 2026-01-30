import { appendAudit, getGitDiffSummary } from './audit.js'
import { execCodex } from './codex.js'
import { buildTaskPrompt } from './prompt.js'

import type { PendingTask, Protocol } from './protocol.js'

export type TaskConfig = {
  workDir: string
  model?: string | undefined
  timeout?: number | undefined
}

export const runTask = async (
  config: TaskConfig,
  protocol: Protocol,
  task: PendingTask,
): Promise<void> => {
  await protocol.appendTaskLog(`task:start id=${task.id}`)
  const stateDir = protocol.getStateDir()
  await appendAudit(stateDir, {
    ts: new Date().toISOString(),
    action: 'task:start',
    taskId: task.id,
    trigger: 'task',
    diff: await getGitDiffSummary(config.workDir),
    ...(task.selfAwakeRunId === undefined
      ? {}
      : { runId: task.selfAwakeRunId }),
  })

  try {
    const result = await execCodex({
      prompt: buildTaskPrompt(task.prompt),
      workDir: config.workDir,
      model: config.model,
      timeout: config.timeout ?? 10 * 60 * 1000,
    })

    await protocol.writeTaskResult({
      id: task.id,
      status: 'done',
      prompt: task.prompt,
      createdAt: task.createdAt,
      result: result.output,
      completedAt: new Date().toISOString(),
      ...(task.origin === undefined ? {} : { origin: task.origin }),
      ...(task.selfAwakeRunId === undefined
        ? {}
        : { selfAwakeRunId: task.selfAwakeRunId }),
    })
    await protocol.appendTaskLog(`task:done id=${task.id}`)
    await appendAudit(stateDir, {
      ts: new Date().toISOString(),
      action: 'task:done',
      taskId: task.id,
      trigger: 'task',
      diff: await getGitDiffSummary(config.workDir),
      ...(task.selfAwakeRunId === undefined
        ? {}
        : { runId: task.selfAwakeRunId }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await protocol.writeTaskResult({
      id: task.id,
      status: 'failed',
      prompt: task.prompt,
      createdAt: task.createdAt,
      error: message,
      completedAt: new Date().toISOString(),
      ...(task.origin === undefined ? {} : { origin: task.origin }),
      ...(task.selfAwakeRunId === undefined
        ? {}
        : { selfAwakeRunId: task.selfAwakeRunId }),
    })
    await protocol.appendTaskLog(`task:failed id=${task.id} error=${message}`)
    await appendAudit(stateDir, {
      ts: new Date().toISOString(),
      action: 'task:failed',
      taskId: task.id,
      trigger: 'task',
      detail: message,
      diff: await getGitDiffSummary(config.workDir),
      ...(task.selfAwakeRunId === undefined
        ? {}
        : { runId: task.selfAwakeRunId }),
    })
  }
}
