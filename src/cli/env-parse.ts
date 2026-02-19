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

export const parseEnvNonNegativeInteger = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 0) return parsed
  console.warn(`[cli] invalid ${name}:`, value)
  return undefined
}
