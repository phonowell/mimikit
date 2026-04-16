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

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const parseRepoQualitySnapshot = (
  value: unknown,
): RepoQualitySnapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const generatedAt =
    typeof raw.generatedAt === 'string' ? raw.generatedAt.trim() : ''
  const sourceLineCount = asNumber(raw.sourceLineCount)
  const sourceLineTarget = asNumber(raw.sourceLineTarget)
  const sourceLineOverage = asNumber(raw.sourceLineOverage)
  const testLineCount = asNumber(raw.testLineCount)
  const webUiLineCount = asNumber(raw.webUiLineCount)
  const promptFileCount = asNumber(raw.promptFileCount)
  const sourceFileCount = asNumber(raw.sourceFileCount)
  const maxSourceFileLines = asNumber(raw.maxSourceFileLines)
  const webUiFileCount = asNumber(raw.webUiFileCount)
  const testFileCount = asNumber(raw.testFileCount)
  if (
    !generatedAt ||
    sourceLineCount === undefined ||
    sourceLineTarget === undefined ||
    sourceLineOverage === undefined ||
    testLineCount === undefined ||
    webUiLineCount === undefined ||
    promptFileCount === undefined ||
    sourceFileCount === undefined ||
    maxSourceFileLines === undefined ||
    webUiFileCount === undefined ||
    testFileCount === undefined
  )
    return null
  return {
    generatedAt,
    sourceFileCount,
    sourceLineCount,
    sourceLineTarget,
    sourceLineOverage,
    maxSourceFileLines,
    webUiFileCount,
    webUiLineCount,
    testFileCount,
    testLineCount,
    promptFileCount,
  }
}

const formatK = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

export const formatRepoQualitySummary = (
  snapshot: RepoQualitySnapshot | null,
): string => {
  if (!snapshot) return ''
  const overage =
    snapshot.sourceLineOverage > 0
      ? ` · +${formatK(snapshot.sourceLineOverage)} over target`
      : ''
  return (
    [
      `Repo src ${formatK(snapshot.sourceLineCount)}/${formatK(snapshot.sourceLineTarget)}`,
      `tests ${formatK(snapshot.testLineCount)}`,
      `webui ${formatK(snapshot.webUiLineCount)}`,
      `prompts ${snapshot.promptFileCount}`,
      `max file ${snapshot.maxSourceFileLines}`,
    ].join(' · ') + overage
  )
}
