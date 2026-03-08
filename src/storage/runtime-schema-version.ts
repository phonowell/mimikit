export const RUNTIME_SNAPSHOT_SCHEMA_VERSION = 'runtime-snapshot.v2'

const RUNTIME_SNAPSHOT_VERSION_RE = /^runtime-snapshot\.v(\d+)$/

export const parseRuntimeSnapshotSchemaMajor = (
  value: string,
): number | undefined => {
  const match = RUNTIME_SNAPSHOT_VERSION_RE.exec(value.trim())
  if (!match?.[1]) return undefined
  const major = Number.parseInt(match[1], 10)
  return Number.isInteger(major) && major >= 1 ? major : undefined
}

export const isRuntimeSnapshotSchemaVersionSupported = (
  value: string,
): boolean => {
  const major = parseRuntimeSnapshotSchemaMajor(value)
  if (major === undefined) return false
  const currentMajor = parseRuntimeSnapshotSchemaMajor(
    RUNTIME_SNAPSHOT_SCHEMA_VERSION,
  )
  if (currentMajor === undefined) return false
  return major <= currentMajor
}
