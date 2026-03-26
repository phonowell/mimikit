import { execFileSync, spawnSync } from 'node:child_process'

const TEST_FILE_RE = /^tests\/.+\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/u
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const listGitPaths = (args: string[]): string[] =>
  execFileSync('git', args, {
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const listChangedTestFiles = (): string[] => {
  const tracked = listGitPaths([
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    'HEAD',
    '--',
    'tests',
  ])
  const untracked = listGitPaths([
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    'tests',
  ])
  return Array.from(new Set([...tracked, ...untracked]))
    .filter((filePath) => TEST_FILE_RE.test(filePath))
    .sort((left, right) => left.localeCompare(right))
}

const main = (): void => {
  const files = listChangedTestFiles()
  if (files.length === 0) {
    console.log('lint-changed-tests: no changed test files')
    return
  }

  console.log(`lint-changed-tests: ${files.length} file(s)`)
  for (const file of files) console.log(` - ${file}`)

  const result = spawnSync(PNPM_BIN, ['exec', 'eslint', ...files], {
    stdio: 'inherit',
  })
  if (result.error) {
    const message =
      result.error instanceof Error ? result.error.message : String(result.error)
    console.error(`lint-changed-tests: failed: ${message}`)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

main()
