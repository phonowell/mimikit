import { useEffect, useState } from 'react'

const DRAFT_STORAGE_KEY = 'mimikit:webui:composer-draft'
const DRAFT_STORAGE_VERSION = 'v2'
const VERSIONED_DRAFT_STORAGE_KEY = `${DRAFT_STORAGE_KEY}:${DRAFT_STORAGE_VERSION}`
let cachedDraftValue: string | null = null

const readDraft = (): string => {
  if (cachedDraftValue !== null) return cachedDraftValue
  try {
    const versionedDraft =
      window.localStorage.getItem(VERSIONED_DRAFT_STORAGE_KEY) ??
      window.localStorage.getItem(DRAFT_STORAGE_KEY)
    cachedDraftValue = versionedDraft ?? ''
    return cachedDraftValue
  } catch {
    cachedDraftValue = ''
    return ''
  }
}

export const useComposerDraft = (): [string, (value: string) => void] => {
  const [value, setValue] = useState<string>(() => readDraft())

  useEffect(() => {
    try {
      cachedDraftValue = value
      if (value) window.localStorage.setItem(VERSIONED_DRAFT_STORAGE_KEY, value)
      else window.localStorage.removeItem(VERSIONED_DRAFT_STORAGE_KEY)

      window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {}
  }, [value])

  return [value, setValue]
}
