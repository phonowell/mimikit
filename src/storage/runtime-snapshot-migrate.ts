import {
  parseRuntimeSnapshotSchemaMajor,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION,
} from './runtime-schema-version.js'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined

const renameLegacyFocusContexts = (source: Record<string, unknown>) => {
  if (!('focusContexts' in source)) return { next: source, changed: false }
  const next = { ...source }
  if (!('focusDigests' in next)) next.focusDigests = next.focusContexts
  delete next.focusContexts
  return { next, changed: true }
}

const dropLegacyRuntimeSnapshotFields = (source: Record<string, unknown>) => {
  const renamed = renameLegacyFocusContexts(source)
  let changed = false
  const next = { ...renamed.next }
  const removableFields = [
    'activeFocusIds',
    'pendingUserChoice',
    'channelTargets',
    'managerCompressedContext',
    'managerPacketSummary',
    'managerLastContextPacket',
    'managerLastUsage',
    'managerUsageTotal',
    'managerFocusCompressedContexts',
  ] as const
  for (const field of removableFields) {
    if (!(field in next)) continue
    delete next[field]
    changed = true
  }
  return { next, changed: renamed.changed || changed }
}

const coerceRuntimeSnapshotToCurrent = (
  source: Record<string, unknown>,
): Record<string, unknown> => {
  const { next } = dropLegacyRuntimeSnapshotFields(source)
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
  if (major === 1 || major === 2 || major === 3 || major === 4 || major === 5) {
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
