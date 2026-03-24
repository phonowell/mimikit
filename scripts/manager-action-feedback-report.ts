import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildPaths } from '../src/persistence/fs/paths.js'

type FeedbackLogRow = {
  event?: string
  time?: string
  count?: number
  names?: unknown
  errors?: unknown
  hints?: unknown
  hintBuckets?: unknown
}

type BucketStat = {
  action: string
  error: string
  hint: string
  count: number
}

type ReportOutput = {
  source: string
  range: {
    from: string
    to: string
  }
  totals: {
    rounds: number
    feedbackItems: number
  }
  topBuckets: BucketStat[]
}

const isIsoInRange = (iso: string, from: string, to: string): boolean =>
  iso >= from && iso <= to

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

const parseJsonl = (raw: string): FeedbackLogRow[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as FeedbackLogRow
      } catch {
        return {}
      }
    })

const safeArg = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const parseArgs = (argv: string[]): {
  workDir: string
  fromIso: string
  toIso: string
  top: number
} => {
  const args = new Map<string, string>()
  for (const token of argv) {
    if (!token.startsWith('--')) continue
    const eqIndex = token.indexOf('=')
    if (eqIndex < 0) continue
    const key = token.slice(2, eqIndex).trim()
    const value = token.slice(eqIndex + 1).trim()
    if (!key || !value) continue
    args.set(key, value)
  }
  const workDir = safeArg(args.get('work-dir')) ?? process.cwd()
  const fromIso = safeArg(args.get('from'))
  const toIso = safeArg(args.get('to'))
  if (!fromIso || !toIso) {
    throw new Error(
      'usage: tsx scripts/manager-action-feedback-report.ts --from=<ISO> --to=<ISO> [--work-dir=<dir>] [--top=20]',
    )
  }
  const topRaw = Number.parseInt(args.get('top') ?? '20', 10)
  const top = Number.isInteger(topRaw) && topRaw > 0 ? topRaw : 20
  return {
    workDir: resolve(workDir),
    fromIso,
    toIso,
    top,
  }
}

const parseBucket = (bucket: string): BucketStat | undefined => {
  const firstSep = bucket.indexOf('::')
  if (firstSep <= 0) return undefined
  const secondSep = bucket.indexOf('::', firstSep + 2)
  if (secondSep <= firstSep + 2) return undefined
  const action = bucket.slice(0, firstSep).trim()
  const error = bucket.slice(firstSep + 2, secondSep).trim()
  const hint = bucket.slice(secondSep + 2).trim()
  if (!action || !error || !hint) return undefined
  return {
    action,
    error,
    hint,
    count: 0,
  }
}

const run = async (): Promise<void> => {
  const { workDir, fromIso, toIso, top } = parseArgs(process.argv.slice(2))
  const paths = buildPaths(workDir)
  const source = paths.log
  const raw = await readFile(source, 'utf8')
  const rows = parseJsonl(raw).filter(
    (row) =>
      row.event === 'manager_action_feedback' &&
      typeof row.time === 'string' &&
      isIsoInRange(row.time, fromIso, toIso),
  )

  const stats = new Map<string, BucketStat>()
  let feedbackItems = 0
  for (const row of rows) {
    const hintBuckets = asStringArray(row.hintBuckets)
    if (hintBuckets.length > 0) {
      for (const bucket of hintBuckets) {
        const parsed = parseBucket(bucket)
        if (!parsed) continue
        const key = `${parsed.action}\n${parsed.error}\n${parsed.hint}`
        const current = stats.get(key)
        if (current) current.count += 1
        else stats.set(key, { ...parsed, count: 1 })
        feedbackItems += 1
      }
      continue
    }

    const names = asStringArray(row.names)
    const errors = asStringArray(row.errors)
    const hints = asStringArray(row.hints)
    const length = Math.min(names.length, errors.length, hints.length)
    for (let index = 0; index < length; index += 1) {
      const action = names[index]
      const error = errors[index]
      const hint = hints[index]
      if (!action || !error || !hint) continue
      const key = `${action}\n${error}\n${hint}`
      const current = stats.get(key)
      if (current) current.count += 1
      else stats.set(key, { action, error, hint, count: 1 })
      feedbackItems += 1
    }
  }

  const topBuckets = [...stats.values()]
    .sort((left, right) => right.count - left.count || left.action.localeCompare(right.action))
    .slice(0, top)

  const output: ReportOutput = {
    source,
    range: {
      from: fromIso,
      to: toIso,
    },
    totals: {
      rounds: rows.length,
      feedbackItems,
    },
    topBuckets,
  }
  console.log(JSON.stringify(output, null, 2))
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[manager-action-feedback-report] ${message}`)
  process.exitCode = 1
})
