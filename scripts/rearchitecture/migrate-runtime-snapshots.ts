import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

import { migrateRuntimeSnapshotToCurrent } from '../../src/storage/runtime-snapshot-migrate.js'
import { parseRuntimeSnapshot } from '../../src/storage/runtime-snapshot-parse.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../src/storage/runtime-schema-version.js'


type MigrationResult = {
  path: string
  sourceVersion: string
  targetVersion: string
  changed: boolean
  valid: boolean
  error?: string
}

type Report = {
  root: string
  scanned: number
  migrated: number
  unchanged: number
  failed: number
  targetVersion: string
  results: MigrationResult[]
}

const parseArg = (name: string): string | undefined => {
  const prefix = `--${name}=`
  const entry = process.argv.find((item) => item.startsWith(prefix))
  return entry ? entry.slice(prefix.length) : undefined
}

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined

const walk = async (root: string): Promise<string[]> => {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const items = await readdir(current, { withFileTypes: true })
    for (const item of items) {
      const next = join(current, item.name)
      if (item.isDirectory()) {
        stack.push(next)
        continue
      }
      if (item.isFile() && item.name === 'runtime-snapshot.json') out.push(next)
    }
  }
  return out.sort((left, right) => left.localeCompare(right))
}

const runMigration = async (path: string, writeBack: boolean): Promise<MigrationResult> => {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const sourceRecord = toRecord(parsed)
  const sourceVersionRaw = sourceRecord?.schemaVersion
  const sourceVersion =
    typeof sourceVersionRaw === 'string' && sourceVersionRaw.trim().length > 0
      ? sourceVersionRaw.trim()
      : 'runtime-snapshot.v1'

  const migrated = migrateRuntimeSnapshotToCurrent(parsed)
  const validated = parseRuntimeSnapshot(migrated.migrated)

  if (writeBack && migrated.changed)
    await writeFile(path, JSON.stringify(migrated.migrated, null, 2), 'utf8')

  return {
    path,
    sourceVersion,
    targetVersion: validated.schemaVersion,
    changed: migrated.changed,
    valid: true,
  }
}

const run = async (): Promise<void> => {
  const rootArg = parseArg('root') ?? '.mimikit'
  const writeBack = parseArg('write') === 'true'
  const outputPath = parseArg('output')
  const root = resolve(rootArg)
  await stat(root)

  const files = await walk(root)
  const results: MigrationResult[] = []
  for (const file of files) {
    try {
      results.push(await runMigration(file, writeBack))
    } catch (error) {
      results.push({
        path: file,
        sourceVersion: 'unknown',
        targetVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
        changed: false,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const report: Report = {
    root,
    scanned: results.length,
    migrated: results.filter((item) => item.changed && item.valid).length,
    unchanged: results.filter((item) => !item.changed && item.valid).length,
    failed: results.filter((item) => !item.valid).length,
    targetVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    results: results.map((item) => ({
      ...item,
      path: relative(root, item.path) || item.path,
    })),
  }

  if (outputPath) {
    await writeFile(resolve(outputPath), JSON.stringify(report, null, 2), 'utf8')
    console.log(
      JSON.stringify(
        {
          reportPath: resolve(outputPath),
          scanned: report.scanned,
          migrated: report.migrated,
          unchanged: report.unchanged,
          failed: report.failed,
          writeBack,
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(JSON.stringify(report, null, 2))
}

void run().catch(async (error: unknown) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'mimikit-migration-failure-'))
  const message = error instanceof Error ? error.message : String(error)
  await writeFile(
    join(sandbox, 'error.txt'),
    `[migrate-runtime-snapshots] ${message}\n`,
    'utf8',
  )
  console.error(`[migrate-runtime-snapshots] ${message}`)
  process.exitCode = 1
})
