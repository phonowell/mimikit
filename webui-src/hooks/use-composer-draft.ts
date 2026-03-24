import { useEffect, useState } from 'react'

const DRAFT_STORAGE_KEY = 'mimikit:webui:composer-draft'

const readDraft = (): string => {
  try {
    return window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export const useComposerDraft = (): [string, (value: string) => void] => {
  const [value, setValue] = useState<string>(() => readDraft())

  useEffect(() => {
    try {
      if (value) window.localStorage.setItem(DRAFT_STORAGE_KEY, value)
      else window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {}
  }, [value])

  return [value, setValue]
}
