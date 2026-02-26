import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureDir, listFiles } from '../fs/paths.js'
import { safe } from '../log/safe.js'
import { parseIsoMs } from '../shared/time.js'

import { readJsonl, writeJsonl } from '../storage/jsonl.js'
import { runSerialized } from '../storage/serialized-lock.js'

import type { HistoryMessage } from '../types/index.js'

const MAX_HISTORY_ITEMS = 1000
const HISTORY_FILE_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/
const FALLBACK_HISTORY_DATE = '1970-01-01'

const compareHistoryMessage = (
  a: HistoryMessage,
  b: HistoryMessage,
): number => {
  const aTs = parseIsoMs(a.createdAt) ?? 0
  const bTs = parseIsoMs(b.createdAt) ?? 0
  if (aTs !== bTs) return aTs - bTs
  return a.id.localeCompare(b.id)
}

const capHistory = (items: HistoryMessage[]): HistoryMessage[] => {
  if (items.length <= MAX_HISTORY_ITEMS) return items
  return items.slice(Math.max(0, items.length - MAX_HISTORY_ITEMS))
}

const toHistoryDate = (createdAt: string): string => {
  const ts = parseIsoMs(createdAt)
  if (ts === undefined) return FALLBACK_HISTORY_DATE
  return new Date(ts).toISOString().slice(0, 10)
}

const readHistoryPartitionFileNames = async (
  historyDir: string,
): Promise<string[]> =>
  (await listFiles(historyDir))
    .filter(
      (entry) => entry.isFile() && HISTORY_FILE_NAME_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

const writeHistory = async (
  historyDir: string,
  items: HistoryMessage[],
): Promise<void> => {
  await ensureDir(historyDir)
  const grouped = new Map<string, HistoryMessage[]>()
  for (const item of items) {
    const key = toHistoryDate(item.createdAt)
    const bucket = grouped.get(key)
    if (bucket) bucket.push(item)
    else grouped.set(key, [item])
  }

  const keepFileNames = new Set(
    Array.from(grouped.keys(), (date) => `${date}.jsonl`),
  )
  await Promise.all(
    [...grouped.entries()].map(([date, history]) =>
      writeJsonl(join(historyDir, `${date}.jsonl`), history),
    ),
  )

  const currentFileNames = await readHistoryPartitionFileNames(historyDir)
  const stalePaths = currentFileNames
    .filter((name) => !keepFileNames.has(name))
    .map((name) => join(historyDir, name))
  if (stalePaths.length === 0) return
  await Promise.all(
    stalePaths.map((path) =>
      safe('writeHistory: remove_stale_history_file', () => unlink(path), {
        fallback: undefined,
        meta: { path },
        ignoreCodes: ['ENOENT'],
      }),
    ),
  )
}

export const readHistory = async (
  historyDir: string,
): Promise<HistoryMessage[]> => {
  await ensureDir(historyDir)
  const fileNames = await readHistoryPartitionFileNames(historyDir)
  if (fileNames.length === 0) return []
  const partitions = await Promise.all(
    fileNames.map((name) => readJsonl<HistoryMessage>(join(historyDir, name))),
  )
  return partitions.flat().sort(compareHistoryMessage)
}

export const rewriteHistory = async (
  historyDir: string,
  items: HistoryMessage[],
): Promise<void> => {
  await runSerialized(historyDir, async () => {
    const next = [...items].sort(compareHistoryMessage)
    await writeHistory(historyDir, capHistory(next))
  })
}

export const appendHistory = async (
  historyDir: string,
  message: HistoryMessage,
): Promise<void> => {
  await runSerialized(historyDir, async () => {
    const current = await readHistory(historyDir)
    const next = [...current, message].sort(compareHistoryMessage)
    await writeHistory(historyDir, capHistory(next))
  })
}
