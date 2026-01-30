import {
  commitSelfAwakeChanges,
  hasWorkingChanges,
  reviewSelfAwakeChanges,
  rollbackSelfAwake,
} from './agent-self-awake-review.js'
import {
  readSelfAwakeState,
  saveSelfAwakeState,
  type SelfAwakeState,
} from './agent-self-awake-state.js'
import { formatTimestamp, truncate, withOptional } from './agent-utils.js'
import { appendAudit, getGitDiffSummary } from './audit.js'

import type { AgentConfig } from './agent-types.js'
import type { TaskResult } from './protocol.js'

export const handleSelfAwakeTaskResults = async (
  config: AgentConfig,
  results: TaskResult[],
): Promise<void> => {
  const selfAwakeResults = results.filter(
    (result) => result.origin === 'self-awake' || result.selfAwakeRunId,
  )
  if (selfAwakeResults.length === 0) return

  const state = await readSelfAwakeState(config.stateDir)

  for (const result of selfAwakeResults) {
    const runId = result.selfAwakeRunId ?? state?.runId
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:task-result',
      trigger: 'self-awake',
      taskId: result.id,
      detail: truncate(result.error ?? result.status, 200),
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })

    const checkHistory = state?.checkHistory
    const baseState: SelfAwakeState = state ?? {
      runId: runId ?? formatTimestamp(),
      startedAt: new Date().toISOString(),
      status: 'started',
      ...withOptional('checkHistory', checkHistory),
    }

    if (result.status === 'failed') {
      await rollbackSelfAwake(
        config,
        state ?? baseState,
        runId,
        result.error ?? 'task failed',
      )
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'rolled-back',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      continue
    }

    if (!(await hasWorkingChanges(config.workDir))) {
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'completed',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:no-changes',
        trigger: 'self-awake',
        taskId: result.id,
        diff: await getGitDiffSummary(config.workDir),
        ...withOptional('runId', runId),
      })
      continue
    }

    const review = await reviewSelfAwakeChanges(config)
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:review',
      trigger: 'self-awake',
      taskId: result.id,
      detail: review.summary,
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })
    if (!review.pass) {
      await rollbackSelfAwake(
        config,
        state ?? baseState,
        runId,
        'review failed',
      )
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'rolled-back',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      continue
    }

    await saveSelfAwakeState(config.stateDir, {
      ...baseState,
      status: 'reviewed',
      taskId: result.id,
      updatedAt: new Date().toISOString(),
    })

    const commit = await commitSelfAwakeChanges(config)
    if (!commit.ok || !commit.branch) {
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'reviewed',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:commit-failed',
        trigger: 'self-awake',
        taskId: result.id,
        diff: await getGitDiffSummary(config.workDir),
        ...withOptional('runId', runId),
        ...withOptional('detail', commit.error ?? 'missing branch'),
      })
      continue
    }

    const commitBranch = commit.branch
    await saveSelfAwakeState(config.stateDir, {
      ...baseState,
      status: 'committed',
      taskId: result.id,
      updatedAt: new Date().toISOString(),
    })
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:commit',
      trigger: 'self-awake',
      taskId: result.id,
      detail: commitBranch,
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:mr',
      trigger: 'self-awake',
      taskId: result.id,
      detail: 'pending',
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })
  }
}
