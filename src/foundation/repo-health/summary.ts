import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type RepoQualitySnapshot = {
  generatedAt: string
  sourceFileCount: number
  sourceLineCount: number
  sourceLineTarget: number
  sourceLineOverage: number
  maxSourceFileLines: number
  webUiFileCount: number
  webUiLineCount: number
  testFileCount: number
  testLineCount: number
  promptFileCount: number
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SOURCE_LINE_TARGET = 20_000
const CACHE_TTL_MS = 30_000

let cachedSnapshot: RepoQualitySnapshot | undefined
let cachedAtMs = 0

const countLines = (source: string): number =>
  source.length === 0 ? 0 : source.split(/\r\n|\n|\r/u).length

const hasAllowedExtension = (
  name: string,
  extensions: readonly string[],
): boolean => extensions.some((extension) => name.endsWith(extension))

const collectTreeStats = async (
  root: string,
  extensions: readonly string[],
): Promise<{
  fileCount: number
  lineCount: number
  maxFileLines: number
}> => {
  const entries = await readdir(root, { withFileTypes: true })
  let fileCount = 0
  let lineCount = 0
  let maxFileLines = 0
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      const child = await collectTreeStats(path, extensions)
      fileCount += child.fileCount
      lineCount += child.lineCount
      maxFileLines = Math.max(maxFileLines, child.maxFileLines)
      continue
    }
    if (!entry.isFile() || !hasAllowedExtension(entry.name, extensions))
      continue
    const source = await readFile(path, 'utf8')
    const lines = countLines(source)
    fileCount += 1
    lineCount += lines
    maxFileLines = Math.max(maxFileLines, lines)
  }
  return { fileCount, lineCount, maxFileLines }
}

const directoryExists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

const collectOptionalTreeStats = async (
  root: string,
  extensions: readonly string[],
) =>
  (await directoryExists(root))
    ? collectTreeStats(root, extensions)
    : { fileCount: 0, lineCount: 0, maxFileLines: 0 }

export const collectRepoQualitySnapshot = async (
  repoRoot: string,
): Promise<RepoQualitySnapshot> => {
  const source = await collectOptionalTreeStats(join(repoRoot, 'src'), ['.ts'])
  const webUi = await collectOptionalTreeStats(join(repoRoot, 'webui-src'), [
    '.ts',
    '.tsx',
  ])
  const tests = await collectOptionalTreeStats(join(repoRoot, 'tests'), [
    '.ts',
    '.tsx',
  ])
  const prompts = await collectOptionalTreeStats(join(repoRoot, 'prompts'), [
    '.md',
  ])
  return {
    generatedAt: new Date().toISOString(),
    sourceFileCount: source.fileCount,
    sourceLineCount: source.lineCount,
    sourceLineTarget: SOURCE_LINE_TARGET,
    sourceLineOverage: Math.max(0, source.lineCount - SOURCE_LINE_TARGET),
    maxSourceFileLines: source.maxFileLines,
    webUiFileCount: webUi.fileCount,
    webUiLineCount: webUi.lineCount,
    testFileCount: tests.fileCount,
    testLineCount: tests.lineCount,
    promptFileCount: prompts.fileCount,
  }
}

export const getCachedRepoQualitySnapshot =
  async (): Promise<RepoQualitySnapshot> => {
    const nowMs = Date.now()
    if (cachedSnapshot && nowMs - cachedAtMs < CACHE_TTL_MS)
      return cachedSnapshot
    cachedSnapshot = await collectRepoQualitySnapshot(REPO_ROOT)
    cachedAtMs = nowMs
    return cachedSnapshot
  }
