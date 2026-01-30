import { spawn } from 'node:child_process'

type GitResult = {
  stdout: string
  stderr: string
  code: number
}

const runGit = (
  workDir: string,
  args: string[],
  timeoutMs = 10_000,
): Promise<GitResult> =>
  new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, code })
    }

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            child.kill()
            finish(-1)
          }, timeoutMs)
        : undefined

    child.stdout.on('data', (data) => (stdout += data.toString()))
    child.stderr.on('data', (data) => (stderr += data.toString()))

    child.on('error', () => finish(-1))
    child.on('close', (code) => finish(code ?? -1))
  })

const compactLines = (text: string, maxLines: number, maxChars: number) => {
  const lines = text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''
  const sliced = lines.slice(0, maxLines)
  let joined = sliced.join(' | ')
  if (lines.length > maxLines) joined += ' | ...'
  if (joined.length > maxChars) joined = `${joined.slice(0, maxChars - 3)}...`
  return joined
}

const truncate = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 3)}...`
}

export const isGitRepo = async (workDir: string): Promise<boolean> => {
  const result = await runGit(workDir, ['rev-parse', '--is-inside-work-tree'])
  return result.code === 0 && result.stdout.trim() === 'true'
}

export const getStatusPorcelain = async (workDir: string): Promise<string> => {
  const result = await runGit(workDir, ['status', '--porcelain'])
  return result.code === 0 ? result.stdout.trimEnd() : ''
}

export const getDiffStatSummary = async (workDir: string): Promise<string> => {
  const [unstaged, staged] = await Promise.all([
    runGit(workDir, ['diff', '--stat']),
    runGit(workDir, ['diff', '--stat', '--staged']),
  ])
  const parts: string[] = []
  const unstagedSummary = compactLines(unstaged.stdout, 20, 800)
  if (unstagedSummary) parts.push(`unstaged: ${unstagedSummary}`)
  const stagedSummary = compactLines(staged.stdout, 20, 800)
  if (stagedSummary) parts.push(`staged: ${stagedSummary}`)
  return parts.join(' | ')
}

export const getDiffPatch = async (
  workDir: string,
  maxChars: number,
): Promise<string> => {
  const [unstaged, staged] = await Promise.all([
    runGit(workDir, ['diff']),
    runGit(workDir, ['diff', '--staged']),
  ])
  let combined = ''
  if (unstaged.stdout.trim())
    combined += `# Unstaged\n${unstaged.stdout.trimEnd()}\n`

  if (staged.stdout.trim()) combined += `# Staged\n${staged.stdout.trimEnd()}\n`

  return truncate(combined.trimEnd(), maxChars)
}

export type StashResult = {
  ok: boolean
  noChanges: boolean
  stashRef?: string
  stdout: string
  stderr: string
}

export const stashPush = async (
  workDir: string,
  message: string,
): Promise<StashResult> => {
  const result = await runGit(workDir, ['stash', 'push', '-u', '-m', message])
  const output = `${result.stdout}${result.stderr}`
  const noChanges = /no local changes to save/i.test(output)
  let stashRef: string | undefined
  if (result.code === 0 && !noChanges) {
    const refResult = await runGit(workDir, [
      'rev-parse',
      '--verify',
      'stash@{0}',
    ])
    if (refResult.code === 0) stashRef = refResult.stdout.trim()
  }
  return {
    ok: result.code === 0,
    noChanges,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(stashRef === undefined ? {} : { stashRef }),
  }
}

export const stashPop = (workDir: string, ref?: string): Promise<GitResult> =>
  runGit(workDir, ref ? ['stash', 'pop', ref] : ['stash', 'pop'])

export const stashDrop = (workDir: string, ref: string): Promise<GitResult> =>
  runGit(workDir, ['stash', 'drop', ref])

export const createBranch = async (
  workDir: string,
  name: string,
): Promise<{ ok: boolean; name: string; result: GitResult }> => {
  const exists = await runGit(workDir, [
    'rev-parse',
    '--verify',
    `refs/heads/${name}`,
  ])
  const finalName = exists.code === 0 ? `${name}-${Date.now()}` : name
  const result = await runGit(workDir, ['checkout', '-b', finalName])
  return { ok: result.code === 0, name: finalName, result }
}

export const commitAll = async (
  workDir: string,
  message: string,
): Promise<GitResult> => {
  const addResult = await runGit(workDir, ['add', '-A'])
  if (addResult.code !== 0) return addResult
  return runGit(workDir, ['commit', '-m', message])
}
