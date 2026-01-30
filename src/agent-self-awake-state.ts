import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { SELF_AWAKE_STATE_FILE } from './agent-self-awake-constants.js'
import { formatTimestamp, truncate, withOptional } from './agent-utils.js'
import { appendAudit, getGitDiffSummary } from './audit.js'
import { isGitRepo, stashPush } from './git.js'
import { shortId } from './id.js'

import type { AgentConfig } from './agent-types.js'

export type SelfAwakeStateStatus =
  | 'started'
  | 'delegated'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'rolled-back'
  | 'reviewed'
  | 'committed'
  | 'no-action'

export type SelfAwakeState = {
  runId: string
  startedAt: string
  status: SelfAwakeStateStatus
  stashRef?: string
  stashMessage?: string
  taskId?: string
  updatedAt?: string
  checkHistory?: Record<string, string>
}

export type SelfAwakeRun = {
  state: SelfAwakeState | null
  allowDelegation: boolean
  active: boolean
}

const selfAwakeStatePath = (stateDir: string): string =>
  join(stateDir, SELF_AWAKE_STATE_FILE)

export const readSelfAwakeState = async (
  stateDir: string,
): Promise<SelfAwakeState | null> => {
  try {
    const data = await readFile(selfAwakeStatePath(stateDir), 'utf-8')
    return JSON.parse(data) as SelfAwakeState
  } catch {
    return null
  }
}

export const saveSelfAwakeState = async (
  stateDir: string,
  state: SelfAwakeState,
): Promise<void> => {
  await mkdir(stateDir, { recursive: true })
  await writeFile(selfAwakeStatePath(stateDir), JSON.stringify(state, null, 2))
}

export const prepareSelfAwakeRun = async (
  config: AgentConfig,
): Promise<SelfAwakeRun> => {
  try {
    const existing = await readSelfAwakeState(config.stateDir)
    const previousCheckHistory = existing?.checkHistory
    if (existing?.status === 'delegated' && existing.taskId) {
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:active',
        trigger: 'self-awake',
        taskId: existing.taskId,
        runId: existing.runId,
        diff: await getGitDiffSummary(config.workDir),
      })
      return { state: existing, allowDelegation: false, active: true }
    }

    const now = new Date()
    const runId = `${formatTimestamp(now)}-${shortId()}`
    const stashMessage = `self-awake-${formatTimestamp(now)}`
    let allowDelegation = true
    let status: SelfAwakeStateStatus = 'started'
    let stashRef: string | undefined
    let detail = ''

    if (!(await isGitRepo(config.workDir))) {
      allowDelegation = false
      status = 'blocked'
      detail = 'not a git repo'
    } else {
      const stash = await stashPush(config.workDir, stashMessage)
      if (!stash.ok) {
        allowDelegation = false
        status = 'blocked'
        detail = truncate(`${stash.stderr}${stash.stdout}`, 200)
      } else if (!stash.noChanges) stashRef = stash.stashRef
    }

    const state: SelfAwakeState = {
      runId,
      startedAt: now.toISOString(),
      status,
      stashMessage,
      updatedAt: now.toISOString(),
      ...withOptional('stashRef', stashRef),
      ...withOptional('checkHistory', previousCheckHistory),
    }

    await saveSelfAwakeState(config.stateDir, state)
    await appendAudit(config.stateDir, {
      ts: now.toISOString(),
      action: 'self-awake:start',
      trigger: 'self-awake',
      runId,
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('detail', detail ? detail : undefined),
    })

    return { state, allowDelegation, active: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:start-failed',
        trigger: 'self-awake',
        detail: truncate(message, 200),
        diff: await getGitDiffSummary(config.workDir),
      })
    } catch {
      // ignore audit failure
    }
    return { state: null, allowDelegation: false, active: false }
  }
}
