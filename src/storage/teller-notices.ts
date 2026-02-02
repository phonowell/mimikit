import { appendJsonl, readJsonl, writeJsonl } from './jsonl.js'
import { withStoreLock } from './store-lock.js'

import type { TellerNotice } from '../types/teller-notice.js'

export const appendTellerNotices = async (
  path: string,
  notices: TellerNotice[],
): Promise<void> => {
  await appendJsonl(path, notices)
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
    await writeJsonl(path, next)
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
    await writeJsonl(path, next)
  })
