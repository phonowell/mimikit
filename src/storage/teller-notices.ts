import { readJsonl, updateJsonl, writeJsonl } from './jsonl.js'
import { withStoreLock } from './store-lock.js'

import type { TellerNotice } from '../types/teller-notice.js'

const MAX_ITEMS = 1000

const capNotices = (notices: TellerNotice[]): TellerNotice[] => {
  if (notices.length <= MAX_ITEMS) return notices
  const pending = notices.filter((notice) => !notice.processedByTeller)
  if (pending.length >= MAX_ITEMS) return pending
  const slots = MAX_ITEMS - pending.length
  const processed = notices.filter((notice) => notice.processedByTeller)
  const keepProcessed = processed.slice(Math.max(0, processed.length - slots))
  const keepIds = new Set<string>([
    ...pending.map((notice) => notice.id),
    ...keepProcessed.map((notice) => notice.id),
  ])
  return notices.filter((notice) => keepIds.has(notice.id))
}

export const appendTellerNotices = async (
  path: string,
  notices: TellerNotice[],
): Promise<void> => {
  if (notices.length === 0) return
  await updateJsonl<TellerNotice>(path, (current) =>
    capNotices([...current, ...notices]),
  )
}

export const readTellerNotices = (path: string): Promise<TellerNotice[]> =>
  readJsonl<TellerNotice>(path)

export const takeUnprocessedNotices = (path: string): Promise<TellerNotice[]> =>
  withStoreLock(path, async () => {
    const notices = await readJsonl<TellerNotice>(path)
    const pending = notices.filter((notice) => !notice.processedByTeller)
    if (pending.length === 0) return []
    const pendingIds = new Set(pending.map((notice) => notice.id))
    const next = notices.map((notice) =>
      pendingIds.has(notice.id)
        ? { ...notice, processedByTeller: true }
        : notice,
    )
    await writeJsonl(path, capNotices(next))
    return pending
  })

export const markNoticesProcessed = (
  path: string,
  ids: string[],
): Promise<void> =>
  withStoreLock(path, async () => {
    const notices = await readJsonl<TellerNotice>(path)
    if (notices.length === 0) return
    const mark = new Set(ids)
    const next = notices.map((notice) =>
      mark.has(notice.id) ? { ...notice, processedByTeller: true } : notice,
    )
    await writeJsonl(path, capNotices(next))
  })
