import {
  parseRuntimeSnapshotSchemaMajor,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION,
} from './runtime-schema-version.js'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined

const coerceRuntimeSnapshotV1ToV2 = (
  source: Record<string, unknown>,
): Record<string, unknown> => {
  const next = { ...source }
  next.schemaVersion = RUNTIME_SNAPSHOT_SCHEMA_VERSION
  return next
}

export const migrateRuntimeSnapshotToCurrent = (
  raw: unknown,
): {
  migrated: unknown
  changed: boolean
  fromVersion?: string
  toVersion: string
} => {
  const record = asRecord(raw)
  if (!record) {
    return {
      migrated: raw,
      changed: false,
      toVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    }
  }
  const rawVersion =
    typeof record.schemaVersion === 'string' ? record.schemaVersion.trim() : ''
  if (!rawVersion) {
    const migrated = coerceRuntimeSnapshotV1ToV2(record)
    return {
      migrated,
      changed: true,
      fromVersion: 'runtime-snapshot.v1',
      toVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    }
  }
  const major = parseRuntimeSnapshotSchemaMajor(rawVersion)
  if (major === 1) {
    const migrated = coerceRuntimeSnapshotV1ToV2(record)
    return {
      migrated,
      changed: true,
      fromVersion: rawVersion,
      toVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    }
  }
  return {
    migrated: raw,
    changed: false,
    fromVersion: rawVersion,
    toVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
  }
}
