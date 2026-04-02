import { basename, resolve } from 'node:path'

import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyWorkerLoop } from '../../kernel/orchestrator/signals.js'
import { appendTaskSystemMessage } from '../../persistence/history/task-events.js'
import { enqueueTask } from '../../work/orchestrator/task-lifecycle.js'
import {
  resolveBranch,
  runGitCapture,
} from '../../work/shared/task-execution-target.js'
import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import { enqueueWorkerTask } from './dispatch.js'

import type {
  Task,
  TaskContract,
  TaskResult,
  TaskResultHandoff,
} from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const appendUniqueItems = (
  items: string[] | undefined,
  next: string[],
): string[] | undefined => {
  const merged = [...(items ?? [])]
  for (const item of next) {
    const normalized = item.trim()
    if (!normalized || merged.includes(normalized)) continue
    merged.push(normalized)
  }
  return merged.length > 0 ? merged : undefined
}

const buildClosureSummary = (task: Task): string =>
  `实现与门禁已完成，等待主仓对 ${task.git?.branch ?? task.id} 执行 merge/cleanup 收尾。`

const buildClosurePrompt = (params: {
  task: Task
  result: TaskResult
  baseBranch: string
  repoRoot: string
}): string => {
  const branch = params.task.git?.branch ?? params.task.branch ?? ''
  const worktreePath = params.task.git?.worktreePath ?? params.task.cwd
  const reviewSha =
    resolveTaskGitLifecycle(params.task)?.review.sha ??
    params.task.git?.lifecycle?.review.sha ??
    ''
  return [
    `在主仓 ${params.repoRoot} 完成源任务 ${params.task.id} 的 git 收尾。`,
    `源任务标题：${params.task.title}`,
    `目标分支：${branch}`,
    `目标 worktree：${worktreePath}`,
    reviewSha ? `review 通过提交：${reviewSha}` : '',
    params.result.archivePath ? `源任务归档：${params.result.archivePath}` : '',
    `先核实 branch 相对 ${params.baseBranch} 的真实状态；若尚未合入且 review 证据充分，则安全 merge 回 ${params.baseBranch}。`,
    `若改动已等价进入 ${params.baseBranch}，则不要重复 merge，只记录证据并继续 cleanup。`,
    '完成后清理对应 worktree 与 branch；若因 dirty/冲突无法清理，明确写出 stopReason 与保留依据。',
  ]
    .filter(Boolean)
    .join('\n')
}

const buildClosureContract = (params: {
  baseBranch: string
  task: Task
  result: TaskResult
}): TaskContract => {
  const branch = params.task.git?.branch ?? params.task.branch ?? params.task.id
  const worktreePath = params.task.git?.worktreePath ?? params.task.cwd
  return {
    goal: `基于主仓 git 真相收尾 ${params.task.id}：完成 ${branch} 的 merge/cleanup 闭环。`,
    scope: `在主仓核实源任务归档、${branch} 相对 ${params.baseBranch} 的状态与 ${worktreePath} 的现场；若需要则 merge 回 ${params.baseBranch}，随后清理对应 worktree/branch。`,
    acceptance: [
      `已核实源任务 ${params.task.id} 的 branch/worktree 与 review 证据`,
      `若分支尚未进入 ${params.baseBranch} 且可安全继续，已完成 merge；若无需 merge，已记录不重复 merge 的证据`,
      '对应 worktree/branch 已清理；若不能清理，已明确写出 stopReason 与保留依据',
    ],
    outOfScope: '重做实现、重跑无关门禁、扩展成新的功能开发或无证据的批量清理',
    contextRefs: [
      `task:${params.task.id}`,
      ...(params.result.archivePath ? [params.result.archivePath] : []),
    ],
  }
}

const requireClosureRepoKey = (task: Task): string => {
  const repoKey = task.repoKey?.trim()
  if (!repoKey) throw new Error(`closure task requires repoKey: ${task.id}`)
  if (basename(repoKey) !== '.git')
    throw new Error(`closure task repoKey must point to .git: ${task.id}`)
  return repoKey
}

const resolveClosureBaseBranch = async (repoRoot: string): Promise<string> => {
  const mainRef = await runGitCapture(repoRoot, [
    'rev-parse',
    '--verify',
    'refs/heads/main^{commit}',
  ])
  if (mainRef) return 'main'
  return (await resolveBranch(repoRoot)) ?? 'main'
}

export const applyClosurePendingResultState = (params: {
  task: Task
  result: TaskResult
}): void => {
  const { task, result } = params
  if (result.status !== 'succeeded') return
  if (resolveTaskResourceMode(task.resourceMode) !== 'write') return
  if (!task.git) return
  if (task.git.closureRequired !== true) return
  const lifecycle = resolveTaskGitLifecycle(task)
  if (!lifecycle) return
  if (lifecycle.merged && lifecycle.cleaned) return

  result.taskStatus = 'paused'
  result.outcome = 'blocked'
  result.stopReason = 'closure_pending'
  const handoff: TaskResultHandoff = result.handoff ?? {}
  const handoffSummary = handoff.summary?.trim()
  handoff.summary =
    handoffSummary && handoffSummary.length > 0
      ? handoffSummary
      : buildClosureSummary(task)
  handoff.nextSteps = appendUniqueItems(handoff.nextSteps, [
    `在主仓完成 ${task.git.branch} 的 merge/cleanup 收尾`,
    '收尾后回写 git closure 真相并复核归档',
  ])
  handoff.risks = appendUniqueItems(handoff.risks, [
    '当前实现已完成，但 git 闭环未完成前不得按 completed 收口',
  ])
  result.handoff = handoff
}

export const enqueueClosureTaskIfNeeded = async (params: {
  runtime: WorkerRuntime
  task: Task
  result: TaskResult
}): Promise<void> => {
  const { runtime, task, result } = params
  if (result.stopReason !== 'closure_pending') return
  if (!task.git) return
  const repoKey = requireClosureRepoKey(task)
  const repoRoot = resolve(repoKey, '..')
  const branch = await resolveClosureBaseBranch(repoRoot)
  const prompt = buildClosurePrompt({
    task,
    result,
    baseBranch: branch,
    repoRoot,
  })
  const contract = buildClosureContract({ task, result, baseBranch: branch })
  const { task: closureTask, created } = await enqueueTask(
    runtime.config.workDir,
    runtime.domain.tasks,
    prompt,
    `收尾：${task.title}`,
    repoRoot,
    'worker',
    'codex',
    task.focusId,
    repoKey,
    branch,
    'write',
    contract,
    false,
  )
  if (created) {
    await appendTaskSystemMessage(
      runtime.paths.history,
      'created',
      closureTask,
      {
        createdAt: closureTask.createdAt,
      },
    )
  }
  if (created || closureTask.status === 'pending') {
    await persistRuntimeState(runtime)
    enqueueWorkerTask(runtime, closureTask)
    notifyWorkerLoop(runtime)
  }
}
