import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { runWorker } from '../roles/worker-runner.js'
import { newId, nowIso } from '../shared/utils.js'
import { buildTaskFingerprint } from '../tasks/queue.js'

import type { Task, TokenUsage } from '../types/index.js'

type ProcessResult = {
  code: number
  stdout: string
  stderr: string
  elapsedMs: number
}

type EvolveCodeInstruction =
  | {
      mode: 'skip'
    }
  | {
      mode: 'code'
      target: string
      prompt: string
    }

type ValidationStep = {
  command: string
  ok: boolean
  elapsedMs: number
}

type GitChanges = {
  tracked: string[]
  untracked: string[]
}

export type CodeEvolveRoundResult = {
  applied: boolean
  reason: string
  output: string
  usage?: TokenUsage
  llmElapsedMs: number
  validation: {
    ok: boolean
    steps: ValidationStep[]
  }
  changedFiles: number
}

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

const runProcess = (params: {
  command: string
  args: string[]
  cwd: string
}): Promise<ProcessResult> => {
  const startedAt = Date.now()
  return new Promise((resolvePromise) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('close', (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      })
    })
    child.on('error', (error) => {
      resolvePromise({
        code: 1,
        stdout,
        stderr: `${stderr}\n${String(error)}`,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      })
    })
  })
}

const normalizeGitPath = (
  line: string,
): { path: string; untracked: boolean } | null => {
  if (line.length < 4) return null
  const status = line.slice(0, 2)
  const rawPath = line.slice(3).trim()
  const path = rawPath.includes(' -> ')
    ? (rawPath.split(' -> ').at(-1)?.trim() ?? '')
    : rawPath
  if (!path) return null
  return { path, untracked: status === '??' }
}

const listGitChanges = async (workDir: string): Promise<GitChanges> => {
  const result = await runProcess({
    command: 'git',
    args: ['status', '--porcelain'],
    cwd: workDir,
  })
  if (result.code !== 0) return { tracked: [], untracked: [] }
  const lines = result.stdout
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .filter((item) => item.length > 0)
  const tracked: string[] = []
  const untracked: string[] = []
  for (const line of lines) {
    const parsed = normalizeGitPath(line)
    if (!parsed) continue
    if (parsed.untracked) untracked.push(parsed.path)
    else tracked.push(parsed.path)
  }
  return { tracked, untracked }
}

const subtractPaths = (after: string[], before: string[]): string[] => {
  if (after.length === 0) return []
  const baseline = new Set(before)
  return after.filter((path) => !baseline.has(path))
}

const diffGitChanges = (params: {
  before: GitChanges
  after: GitChanges
}): GitChanges => ({
  tracked: subtractPaths(params.after.tracked, params.before.tracked),
  untracked: subtractPaths(params.after.untracked, params.before.untracked),
})

const onlyContainsAllowedDirtyPaths = (params: {
  changes: GitChanges
  allowDirtyPaths: string[]
}): boolean => {
  if (params.changes.untracked.length > 0) return false
  if (params.changes.tracked.length === 0) return true
  const allow = new Set(params.allowDirtyPaths)
  return params.changes.tracked.every((path) => allow.has(path))
}

const rollbackChanges = async (params: {
  workDir: string
  changes: GitChanges
}): Promise<void> => {
  if (params.changes.tracked.length > 0) {
    await runProcess({
      command: 'git',
      args: [
        'restore',
        '--staged',
        '--worktree',
        '--',
        ...params.changes.tracked,
      ],
      cwd: params.workDir,
    })
  }
  for (const file of params.changes.untracked) {
    const fullPath = resolve(params.workDir, file)
    const rel = relative(params.workDir, fullPath)
    if (rel.startsWith('..') || isAbsolute(rel)) continue
    await rm(fullPath, { recursive: true, force: true })
  }
}

const runValidation = async (
  workDir: string,
): Promise<{
  ok: boolean
  steps: ValidationStep[]
}> => {
  const commands: Array<{ args: string[]; label: string }> = [
    { args: ['type-check'], label: 'pnpm type-check' },
    { args: ['lint'], label: 'pnpm lint' },
    { args: ['test'], label: 'pnpm test' },
  ]
  const steps: ValidationStep[] = []
  for (const command of commands) {
    const result = await runProcess({
      command: 'pnpm',
      args: command.args,
      cwd: workDir,
    })
    const step: ValidationStep = {
      command: command.label,
      ok: result.code === 0,
      elapsedMs: result.elapsedMs,
    }
    steps.push(step)
    if (!step.ok) return { ok: false, steps }
  }
  return { ok: true, steps }
}

const buildCodeEvolvePrompt = (feedbackMessages: string[]): string => {
  const cases = feedbackMessages
    .slice(0, 20)
    .map((item, index) => `${index + 1}. ${item}`)
  return [
    'You are the system code-evolution planner.',
    'Goal: choose the highest-ROI issue from feedback and propose minimal code changes.',
    'Constraints: modify only directly relevant code; avoid architecture rewrites; keep rollback-safe.',
    'Do not target prompt files under prompts/*; focus on code files.',
    'Output strict JSON only in one of these forms:',
    '{"mode":"code","target":"<file or module>","prompt":"<short execution instruction>"}',
    '{"mode":"skip"}',
    'Feedback list:',
    ...cases,
  ].join('\n')
}

const parseInstruction = (output: string): EvolveCodeInstruction => {
  const trimmed = output.trim()
  if (!trimmed) return { mode: 'skip' }
  try {
    const parsed = JSON.parse(trimmed) as Partial<EvolveCodeInstruction>
    if (parsed.mode === 'code') {
      const target = parsed.target?.trim()
      const prompt = parsed.prompt?.trim()
      if (!target || !prompt) return { mode: 'skip' }
      return { mode: 'code', target, prompt }
    }
    return { mode: 'skip' }
  } catch {
    return { mode: 'skip' }
  }
}

const isPromptTarget = (target: string): boolean => {
  const normalized = target.replaceAll('\\', '/').toLowerCase()
  return normalized.startsWith('prompts/') || normalized.includes('/prompts/')
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
    kind: 'system_evolve',
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
    kind: 'system_evolve',
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
    validation,
    changedFiles,
  }
}
