export const parseChannelEnabledEnv = (params: {
  value: string | undefined
  envName: string
}): boolean | undefined => {
  const { value, envName } = params
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === '1' || normalized === 'true' || normalized === 'yes')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no')
    return false
  console.warn(`[cli] invalid ${envName}:`, value)
  return undefined
}

export const applyTrimmedEnv = (params: {
  value: string | undefined
  assign: (next: string) => void
}): void => {
  const trimmed = params.value?.trim()
  if (!trimmed) return
  params.assign(trimmed)
}
