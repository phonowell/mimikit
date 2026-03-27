export const NO_CHOICE_RETURN_SOURCES = ['telegram'] as const

export type NoChoiceReturnSource = (typeof NO_CHOICE_RETURN_SOURCES)[number]

export const normalizeSource = (source: string | undefined): string =>
  source?.trim().toLowerCase() ?? ''

export const isNoChoiceReturnChannelSource = (
  source: string | undefined,
): boolean => {
  const normalized = normalizeSource(source)
  if (!normalized) return false
  return NO_CHOICE_RETURN_SOURCES.includes(normalized as NoChoiceReturnSource)
}
