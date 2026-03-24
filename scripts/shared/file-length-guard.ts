export const DEFAULT_FILE_LENGTH_LIMIT = 200

export type FileLengthExemption = {
  path: string
  maxLines: number
  reason: string
}

export type FileLengthGuardConfig = {
  limit: number
  exemptions: FileLengthExemption[]
}

export type FileLengthStat = {
  path: string
  lineCount: number
}

export type FileLengthViolationKind = 'new_oversize' | 'exemption_grew'

export type FileLengthViolation = {
  kind: FileLengthViolationKind
  path: string
  lineCount: number
  limit: number
  reason?: string
}

const DOC_PATHS = new Set(['README.md', 'CONTRIBUTING.md'])
const DOC_PREFIXES = ['docs/design/', 'workflows/']
const CODE_PREFIXES = ['scripts/', 'src/', 'tests/', 'webui/', 'webui-src/']
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])

const fileExtensionOf = (filePath: string): string => {
  const dotIndex = filePath.lastIndexOf('.')
  return dotIndex >= 0 ? filePath.slice(dotIndex) : ''
}

export const shouldCheckFilePath = (filePath: string): boolean => {
  if (DOC_PATHS.has(filePath)) return true
  if (DOC_PREFIXES.some((prefix) => filePath.startsWith(prefix))) return filePath.endsWith('.md')
  if (CODE_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return CODE_EXTENSIONS.has(fileExtensionOf(filePath))
  }
  return false
}

export const countTextLines = (source: string): number => {
  const normalized = source.replace(/\r\n?/gu, '\n')
  if (normalized.length === 0) return 0
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  return body.length === 0 ? 0 : body.split('\n').length
}

const compareByPath = (left: { path: string }, right: { path: string }): number =>
  left.path.localeCompare(right.path)

export const buildExemptionMap = (
  exemptions: readonly FileLengthExemption[],
): Map<string, FileLengthExemption> => {
  const map = new Map<string, FileLengthExemption>()
  for (const exemption of exemptions) {
    map.set(exemption.path, exemption)
  }
  return map
}

export const evaluateFileLengthStats = (params: {
  stats: readonly FileLengthStat[]
  limit: number
  exemptions: readonly FileLengthExemption[]
}): FileLengthViolation[] => {
  const exemptionsByPath = buildExemptionMap(params.exemptions)
  const violations: FileLengthViolation[] = []

  for (const stat of params.stats) {
    if (stat.lineCount <= params.limit) continue

    const exemption = exemptionsByPath.get(stat.path)
    if (!exemption) {
      violations.push({
        kind: 'new_oversize',
        path: stat.path,
        lineCount: stat.lineCount,
        limit: params.limit,
      })
      continue
    }

    if (stat.lineCount <= exemption.maxLines) continue

    violations.push({
      kind: 'exemption_grew',
      path: stat.path,
      lineCount: stat.lineCount,
      limit: exemption.maxLines,
      reason: exemption.reason,
    })
  }

  return violations.sort(compareByPath)
}
