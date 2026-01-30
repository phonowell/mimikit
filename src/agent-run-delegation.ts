import { MAX_DELEGATIONS } from './agent-constants.js'
import { type DelegationSpec, enqueueDelegations } from './agent-delegation.js'
import {
  collectSelfAwakeCheckIds,
  SELF_AWAKE_CHECK_IDS,
  type SelfAwakeCheckId,
  updateCheckHistory,
} from './agent-self-awake-checks.js'
import { SELF_AWAKE_MAX_DELEGATIONS } from './agent-self-awake-constants.js'
import {
  saveSelfAwakeState,
  type SelfAwakeRun,
} from './agent-self-awake-state.js'
import { truncate, withOptional } from './agent-utils.js'
import { appendAudit, getGitDiffSummary } from './audit.js'

import type { AgentConfig } from './agent-types.js'
import type { Protocol } from './protocol.js'

export const runDelegationFlow = async (params: {
  config: AgentConfig
  protocol: Protocol
  isSelfAwake: boolean
  selfAwake: SelfAwakeRun
  delegations: DelegationSpec[]
  attemptedChecks: SelfAwakeCheckId[]
}): Promise<void> => {
  try {
    const allowDelegation =
      !params.isSelfAwake || params.selfAwake.allowDelegation
    const effectiveDelegations = allowDelegation ? params.delegations : []
    const delegationOptions: {
      maxDelegations: number
      origin: 'self-awake' | 'event'
      selfAwakeRunId?: string
    } = {
      maxDelegations: params.isSelfAwake
        ? SELF_AWAKE_MAX_DELEGATIONS
        : MAX_DELEGATIONS,
      origin: params.isSelfAwake ? 'self-awake' : 'event',
      ...(params.selfAwake.state?.runId === undefined
        ? {}
        : { selfAwakeRunId: params.selfAwake.state.runId }),
    }
    const tasks = await enqueueDelegations(
      params.protocol,
      effectiveDelegations,
      delegationOptions,
    )
    const enqueued = tasks.length
    if (
      params.isSelfAwake &&
      !allowDelegation &&
      params.delegations.length > 0
    ) {
      const runId = params.selfAwake.state?.runId
      await appendAudit(params.config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:skip-delegation',
        trigger: 'self-awake',
        detail: 'delegation blocked',
        diff: await getGitDiffSummary(params.config.workDir),
        ...withOptional('runId', runId),
      })
    }
    const firstTask = tasks[0]
    if (params.isSelfAwake && firstTask && params.selfAwake.state) {
      const updatedAt = new Date().toISOString()
      const delegatedChecks = collectSelfAwakeCheckIds(tasks)
      const checkHistory = updateCheckHistory(
        params.selfAwake.state.checkHistory,
        delegatedChecks,
        updatedAt,
      )
      await saveSelfAwakeState(params.config.stateDir, {
        ...params.selfAwake.state,
        status: 'delegated',
        taskId: firstTask.id,
        updatedAt,
        ...withOptional('checkHistory', checkHistory),
      })
      await appendAudit(params.config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:delegate',
        trigger: 'self-awake',
        taskId: firstTask.id,
        runId: params.selfAwake.state.runId,
        detail: truncate(firstTask.prompt, 200),
        diff: await getGitDiffSummary(params.config.workDir),
      })
    }
    if (params.isSelfAwake && tasks.length === 0 && params.selfAwake.state) {
      const updatedAt = new Date().toISOString()
      const checkHistory = params.selfAwake.active
        ? params.selfAwake.state.checkHistory
        : params.delegations.length === 0
          ? updateCheckHistory(
              params.selfAwake.state.checkHistory,
              [...SELF_AWAKE_CHECK_IDS],
              updatedAt,
            )
          : updateCheckHistory(
              params.selfAwake.state.checkHistory,
              params.attemptedChecks,
              updatedAt,
            )
      await saveSelfAwakeState(params.config.stateDir, {
        ...params.selfAwake.state,
        status: params.selfAwake.active
          ? params.selfAwake.state.status
          : 'no-action',
        updatedAt,
        ...withOptional('checkHistory', checkHistory),
      })
    }
    if (enqueued > 0)
      await params.protocol.appendTaskLog(`agent:delegate count=${enqueued}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await params.protocol.appendTaskLog(
      `agent:delegate failed error=${message}`,
    )
  }
}
