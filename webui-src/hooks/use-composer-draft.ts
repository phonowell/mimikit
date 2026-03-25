import { useEffect, useState } from 'react'

const DRAFT_STORAGE_KEY = 'mimikit:webui:composer-draft'
let cachedDraftValue: string | null = null

const readDraft = (): string => {
  if (cachedDraftValue !== null) return cachedDraftValue
  try {
    cachedDraftValue = window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''
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
      if (value) window.localStorage.setItem(DRAFT_STORAGE_KEY, value)
      else window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {}
  }, [value])

  return [value, setValue]
}
