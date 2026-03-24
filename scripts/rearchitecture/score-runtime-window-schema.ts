import { readFile } from 'node:fs/promises'

import { parseRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot-parse.js'

import { type ScoreValue } from './score-runtime-window-model.js'

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
    const parsed = parseRuntimeSnapshot(parsedRaw)
    return {
      schemaCoverageRate: parsed.schemaVersion ? 1 : 0,
      schemaVersionConflictRate: 0,
      migrationIntegrityRate: 'na',
    }
  } catch {
    return {
      schemaCoverageRate: 0,
      schemaVersionConflictRate: 1,
      migrationIntegrityRate: 'na',
    }
  }
}
