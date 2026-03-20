import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  DEFAULT_FILE_LENGTH_LIMIT,
  countTextLines,
  evaluateFileLengthStats,
  shouldCheckFilePath,
  type FileLengthExemption,
  type FileLengthStat,
  type FileLengthViolation,
} from './shared/file-length-guard.ts'

const EXEMPTIONS_FILE = resolve('scripts/file-length-guard-exemptions.tsv')

const fail = (message: string): never => {
  throw new Error(message)
}

const parseExemptions = (source: string): FileLengthExemption[] => {
  const exemptions: FileLengthExemption[] = []
  const lines = source.replace(/\r\n?/gu, '\n').split('\n')

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue

    const [path, maxLinesText, ...reasonParts] = rawLine.split('\t')
    const reason = reasonParts.join('\t').trim()
    const maxLines = Number(maxLinesText)
    if (!path || !Number.isInteger(maxLines) || maxLines <= DEFAULT_FILE_LENGTH_LIMIT || reason.length === 0) {
      fail(`invalid exemption at line ${String(index + 1)}`)
    }
    exemptions.push({ path, maxLines, reason })
  }

  return exemptions
}

const listTrackedFiles = (): string[] => {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
  return output.split('\0').filter((filePath) => filePath.length > 0)
}

const collectStats = async (filePaths: readonly string[]): Promise<FileLengthStat[]> => {
  const stats = await Promise.all(
    filePaths.filter(shouldCheckFilePath).map(async (filePath) => {
      try {
      const source = await readFile(filePath, 'utf8')
      return { path: filePath, lineCount: countTextLines(source) }
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    }),
  )
  return stats
    .filter((stat): stat is FileLengthStat => stat !== null)
    .sort((left, right) => left.path.localeCompare(right.path))
}

const formatViolation = (violation: FileLengthViolation): string => {
  if (violation.kind === 'new_oversize') {
    return ` - new_oversize ${violation.path} lines=${String(violation.lineCount)} limit=${String(violation.limit)}`
  }
  return ` - exemption_grew ${violation.path} lines=${String(violation.lineCount)} baseline=${String(violation.limit)} reason=${violation.reason ?? 'missing_reason'}`
}

const REMEDIATION_GUIDANCE = [
  'check-file-length: remediation:',
  ' - split by responsibility and move stable subflows/types/helpers into narrower files',
  ' - do not game the limit by reformatting code, collapsing blank lines, merging statements, or other layout-only tricks',
  ' - line count reduction only counts when the file actually becomes simpler and smaller in responsibility',
].join('\n')

const main = async () => {
  const exemptions = parseExemptions(await readFile(EXEMPTIONS_FILE, 'utf8'))
  const stats = await collectStats(listTrackedFiles())
  const violations = evaluateFileLengthStats({
    stats,
    limit: DEFAULT_FILE_LENGTH_LIMIT,
    exemptions,
  })

  if (violations.length === 0) {
    console.log(
      `check-file-length: passed (scanned=${String(stats.length)} limit=${String(DEFAULT_FILE_LENGTH_LIMIT)} exemptions=${String(exemptions.length)})`,
    )
    return
  }

  console.log(
    `check-file-length: found ${String(violations.length)} violation(s); limit=${String(DEFAULT_FILE_LENGTH_LIMIT)} exemptions=${String(exemptions.length)}`,
  )
  for (const violation of violations) {
    console.log(formatViolation(violation))
  }
  console.log(REMEDIATION_GUIDANCE)
  process.exitCode = 1
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`check-file-length: failed: ${message}`)
  process.exitCode = 1
})
