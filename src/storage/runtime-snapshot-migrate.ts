import {
  parseRuntimeSnapshotSchemaMajor,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION,
} from './runtime-schema-version.js'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined

const dropLegacyRuntimeSnapshotFields = (source: Record<string, unknown>) => {
  let changed = false
  const next = { ...source }
  if ('activeFocusIds' in next) {
    delete next.activeFocusIds
    changed = true
  }
  return { next, changed }
}

const coerceRuntimeSnapshotToCurrent = (
  source: Record<string, unknown>,
): Record<string, unknown> => {
  const { next } = dropLegacyRuntimeSnapshotFields(source)
  if ('managerCompressedContext' in next && !('managerPacketSummary' in next)) {
    next.managerPacketSummary = next.managerCompressedContext
    delete next.managerCompressedContext
  }
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
    const migrated = coerceRuntimeSnapshotToCurrent(record)
    return {
      migrated,
      changed: true,
      fromVersion: 'runtime-snapshot.v1',
      toVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    }
  }
  const major = parseRuntimeSnapshotSchemaMajor(rawVersion)
  if (major === 1 || major === 2 || major === 3) {
    const migrated = coerceRuntimeSnapshotToCurrent(record)
    return {
      migrated,
      changed: true,
      fromVersion: rawVersion,
      toVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    }
  }
  const stripped = dropLegacyRuntimeSnapshotFields(record)
  if (stripped.changed) {
    return {
      migrated: stripped.next,
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
