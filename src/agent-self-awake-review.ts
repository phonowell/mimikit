import {
  REVIEW_DIFF_MAX_CHARS,
  REVIEW_TIMEOUT_MS,
} from './agent-self-awake-constants.js'
import { formatTimestamp, truncate, withOptional } from './agent-utils.js'
import { appendAudit, getGitDiffSummary } from './audit.js'
import { execCodex } from './codex.js'
import {
  commitAll,
  createBranch,
  getDiffPatch,
  getStatusPorcelain,
  stashDrop,
  stashPop,
  stashPush,
} from './git.js'

import type { SelfAwakeState } from './agent-self-awake-state.js'
import type { AgentConfig } from './agent-types.js'

export const hasWorkingChanges = async (workDir: string): Promise<boolean> => {
  const status = await getStatusPorcelain(workDir)
  return status.trim().length > 0
}

export const reviewSelfAwakeChanges = async (
  config: AgentConfig,
): Promise<{ pass: boolean; summary: string }> => {
  const status = await getStatusPorcelain(config.workDir)
  const diff = await getDiffPatch(config.workDir, REVIEW_DIFF_MAX_CHARS)
  if (!status.trim() && !diff.trim())
    return { pass: true, summary: 'no changes' }

  const prompt = buildReviewPrompt(status, diff)
  const result = await execCodex({
    prompt,
    workDir: config.workDir,
    model: config.model,
    timeout: Math.min(config.timeout ?? 10 * 60 * 1000, REVIEW_TIMEOUT_MS),
  })
  const output = result.output.trim()
  const pass = parseReviewDecision(output) === 'pass'
  return { pass, summary: truncate(output || 'no output', 400) }
}

export const parseReviewDecision = (output: string): 'pass' | 'fail' => {
  const upper = output.toUpperCase()
  if (upper.includes('FAIL')) return 'fail'
  if (upper.includes('PASS')) return 'pass'
  return 'fail'
}

export const buildReviewPrompt = (status: string, diff: string): string => {
  const statusBlock = status.trim() ? status.trim() : '(clean)'
  const diffBlock = diff.trim() ? diff.trim() : '(no diff)'
  return [
    'Output exactly: PASS or FAIL.',
    'If FAIL: add up to 3 short bullet reasons.',
    'Git status:',
    '```',
    statusBlock,
    '```',
    'Diff:',
    '```diff',
    diffBlock,
    '```',
  ].join('\n')
}

export const commitSelfAwakeChanges = async (
  config: AgentConfig,
): Promise<{ ok: boolean; branch?: string; error?: string }> => {
  if (!(await hasWorkingChanges(config.workDir)))
    return { ok: false, error: 'no changes' }
  const timestamp = formatTimestamp()
  const branchBase = `self-improve/${timestamp}`
  const branchResult = await createBranch(config.workDir, branchBase)
  if (!branchResult.ok) {
    return {
      ok: false,
      error: truncate(
        `${branchResult.result.stderr}${branchResult.result.stdout}`,
        300,
      ),
    }
  }
  const commitResult = await commitAll(
    config.workDir,
    `self-improve: ${timestamp}`,
  )
  if (commitResult.code !== 0) {
    return {
      ok: false,
      branch: branchResult.name,
      error: truncate(`${commitResult.stderr}${commitResult.stdout}`, 300),
    }
  }
  return { ok: true, branch: branchResult.name }
}

export const rollbackSelfAwake = async (
  config: AgentConfig,
  state: SelfAwakeState | null,
  runId: string | undefined,
  reason: string,
): Promise<void> => {
  const fallbackRun = runId ?? formatTimestamp()
  const failedStash = await stashPush(
    config.workDir,
    `self-awake-failed-${fallbackRun}`,
  )
  let detail = reason
  let popOk = true
  if (!failedStash.ok) detail = `${detail}; stash failed`
  if (state?.stashRef) {
    const popResult = await stashPop(config.workDir, state.stashRef)
    if (popResult.code !== 0) {
      popOk = false
      detail = `${detail}; stash pop failed: ${truncate(
        `${popResult.stderr}${popResult.stdout}`,
        200,
      )}`
    }
  }
  if (failedStash.stashRef && popOk)
    await stashDrop(config.workDir, failedStash.stashRef)

  await appendAudit(config.stateDir, {
    ts: new Date().toISOString(),
    action: 'self-awake:rollback',
    trigger: 'self-awake',
    detail: truncate(detail, 300),
    diff: await getGitDiffSummary(config.workDir),
    ...withOptional('runId', runId),
  })
}
