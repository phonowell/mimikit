export const parseEnvBoolean = (
  name: string,
  value: string | undefined,
): boolean | undefined => {
  if (!value) return undefined
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}

export const parseEnvPositiveInteger = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}

export const parseEnvNonNegativeNumber = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}
