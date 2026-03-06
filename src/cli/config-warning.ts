export type CliWarn = (message: string) => void

export const buildUnknownConfigKeysWarning = (
  keys: readonly string[],
): string => {
  const keyList = [...keys]
    .sort((left, right) => left.localeCompare(right))
    .join(', ')
  return `[cli] detected unknown config keys: ${keyList}; they will be ignored and do not block startup`
}

export const warnIgnoredUnknownConfigKeys = (
  keys: readonly string[],
  warn: CliWarn,
): void => {
  if (keys.length === 0) return
  warn(buildUnknownConfigKeysWarning(keys))
}
