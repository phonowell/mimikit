import { spawn } from 'node:child_process'

import type { ValidationStep } from './code-evolve-types.js'

type ProcessResult = {
  code: number
  stdout: string
  stderr: string
  elapsedMs: number
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

export const runValidation = async (
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

export const runGitStatus = async (
  workDir: string,
): Promise<{ ok: boolean; stdout: string }> => {
  const result = await runProcess({
    command: 'git',
    args: ['status', '--porcelain'],
    cwd: workDir,
  })
  return {
    ok: result.code === 0,
    stdout: result.stdout,
  }
}

export const runGitRestore = async (
  workDir: string,
  files: string[],
): Promise<void> => {
  if (files.length === 0) return
  await runProcess({
    command: 'git',
    args: ['restore', '--staged', '--worktree', '--', ...files],
    cwd: workDir,
  })
}
