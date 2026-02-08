import { newId, nowIso } from '../shared/utils.js'
import { buildTaskFingerprint } from '../tasks/queue.js'
import { runWorker } from '../worker/expert-runner.js'

import {
  diffGitChanges,
  listGitChanges,
  onlyContainsAllowedDirtyPaths,
  rollbackChanges,
} from './code-evolve-git.js'
import {
  buildCodeEvolvePrompt,
  isPromptTarget,
  parseInstruction,
} from './code-evolve-instruction.js'
import { runValidation } from './code-evolve-process.js'

import type { CodeEvolveRoundResult } from './code-evolve-types.js'
import type { Task, TokenUsage } from '../types/index.js'

const mergeUsage = (
  primary?: TokenUsage,
  secondary?: TokenUsage,
): TokenUsage | undefined => {
  const input = (primary?.input ?? 0) + (secondary?.input ?? 0)
  const output = (primary?.output ?? 0) + (secondary?.output ?? 0)
  const total = (primary?.total ?? 0) + (secondary?.total ?? 0)
  if (total <= 0) return undefined
  return { input, output, total }
}

export const runCodeEvolveRound = async (params: {
  stateDir: string
  workDir: string
  timeoutMs: number
  model?: string
  feedbackMessages: string[]
  allowDirtyPaths?: string[]
}): Promise<CodeEvolveRoundResult> => {
  const before = await listGitChanges(params.workDir)
  if (
    !onlyContainsAllowedDirtyPaths({
      changes: before,
      allowDirtyPaths: params.allowDirtyPaths ?? [],
    })
  ) {
    return {
      applied: false,
      reason: 'repo_not_clean',
      output: 'code evolve skipped: git working tree is not clean',
      llmElapsedMs: 0,
      changedPaths: { tracked: [], untracked: [] },
      validation: { ok: false, steps: [] },
      changedFiles: 0,
    }
  }

  const taskPrompt = buildCodeEvolvePrompt(params.feedbackMessages)
  const task: Task = {
    id: newId(),
    fingerprint: buildTaskFingerprint(taskPrompt),
    prompt: taskPrompt,
    title: 'System evolve code',
    profile: 'expert',
    status: 'running',
    createdAt: nowIso(),
  }
  const plannerResult = await runWorker({
    stateDir: params.stateDir,
    workDir: params.workDir,
    task,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })
  const instruction = parseInstruction(plannerResult.output)
  if (instruction.mode !== 'code') {
    const usage = mergeUsage(plannerResult.usage)
    return {
      applied: false,
      reason: 'no_code_plan',
      output: plannerResult.output,
      ...(usage ? { usage } : {}),
      llmElapsedMs: plannerResult.elapsedMs,
      changedPaths: { tracked: [], untracked: [] },
      validation: { ok: true, steps: [] },
      changedFiles: 0,
    }
  }
  if (isPromptTarget(instruction.target)) {
    const usage = mergeUsage(plannerResult.usage)
    return {
      applied: false,
      reason: 'prompt_target_blocked',
      output: plannerResult.output,
      ...(usage ? { usage } : {}),
      llmElapsedMs: plannerResult.elapsedMs,
      changedPaths: { tracked: [], untracked: [] },
      validation: { ok: true, steps: [] },
      changedFiles: 0,
    }
  }

  const executeTask: Task = {
    id: newId(),
    fingerprint: buildTaskFingerprint(
      `${instruction.target}\n${instruction.prompt}`,
    ),
    prompt: `Only modify ${instruction.target}\n${instruction.prompt}`,
    title: 'System evolve code apply',
    profile: 'expert',
    status: 'running',
    createdAt: nowIso(),
  }
  const workerResult = await runWorker({
    stateDir: params.stateDir,
    workDir: params.workDir,
    task: executeTask,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })

  const after = await listGitChanges(params.workDir)
  const codeChanges = diffGitChanges({ before, after })
  const changedFiles = codeChanges.tracked.length + codeChanges.untracked.length
  const llmElapsedMs = plannerResult.elapsedMs + workerResult.elapsedMs
  if (changedFiles === 0) {
    const usage = mergeUsage(plannerResult.usage, workerResult.usage)
    return {
      applied: false,
      reason: 'no_code_change',
      output: workerResult.output,
      ...(usage ? { usage } : {}),
      llmElapsedMs,
      changedPaths: { tracked: [], untracked: [] },
      validation: { ok: true, steps: [] },
      changedFiles,
    }
  }

  const validation = await runValidation(params.workDir)
  if (!validation.ok) {
    await rollbackChanges({ workDir: params.workDir, changes: codeChanges })
    const usage = mergeUsage(plannerResult.usage, workerResult.usage)
    return {
      applied: false,
      reason: 'validation_failed',
      output: workerResult.output,
      ...(usage ? { usage } : {}),
      llmElapsedMs,
      changedPaths: codeChanges,
      validation,
      changedFiles,
    }
  }

  const usage = mergeUsage(plannerResult.usage, workerResult.usage)
  return {
    applied: true,
    reason: 'validated',
    output: workerResult.output,
    ...(usage ? { usage } : {}),
    llmElapsedMs,
    changedPaths: codeChanges,
    validation,
    changedFiles,
  }
}
