import { readFile } from 'node:fs/promises'

import { migrateRuntimeSnapshotToCurrent } from '../../src/storage/runtime-snapshot-migrate.js'
import { isRuntimeSnapshotSchemaVersionSupported } from '../../src/storage/runtime-schema-version.js'
import { parseRuntimeSnapshot } from '../../src/storage/runtime-snapshot-parse.js'

import { ratio, type ScoreValue } from './score-runtime-window-model.js'

export const evaluateSchemaMetrics = async (params: {
  runtimeSnapshotPath: string
  migrationEventCount: number
}): Promise<{
  schemaCoverageRate: ScoreValue
  schemaVersionConflictRate: ScoreValue
  migrationIntegrityRate: ScoreValue
}> => {
  try {
    const rawSnapshotText = await readFile(params.runtimeSnapshotPath, 'utf8')
    const parsedRaw = JSON.parse(rawSnapshotText) as unknown
    const migrated = migrateRuntimeSnapshotToCurrent(parsedRaw)
    const parsed = parseRuntimeSnapshot(migrated.migrated)
    return {
      schemaCoverageRate: parsed.schemaVersion ? 1 : 0,
      schemaVersionConflictRate: isRuntimeSnapshotSchemaVersionSupported(
        parsed.schemaVersion,
      )
        ? 0
        : 1,
      migrationIntegrityRate:
        params.migrationEventCount > 0
          ? ratio(params.migrationEventCount, params.migrationEventCount)
          : 'na',
    }
  } catch {
    return {
      schemaCoverageRate: 0,
      schemaVersionConflictRate: 1,
      migrationIntegrityRate: params.migrationEventCount > 0 ? 0 : 'na',
    }
  }
}
