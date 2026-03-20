export const RUNTIME_SNAPSHOT_SCHEMA_VERSION = 'runtime-snapshot.v7'

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
): boolean => value.trim() === RUNTIME_SNAPSHOT_SCHEMA_VERSION
