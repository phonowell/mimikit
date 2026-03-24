import { fetchWithTimeout } from '../../webui/fetch-with-timeout.js'
import { UI_TEXT } from '../../webui/system-text.js'

import { readJsonError } from './controller-utils.js'

import type { AppState, QuoteState } from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

const SEND_TIMEOUT_MS = 45_000

type ScrollController = {
  captureLayoutShift: () => void
}

type Args = {
  appendClientError: (error: unknown) => void
  composerValue: string
  quote: QuoteState | null
  scroll: ScrollController
  sendPending: boolean
  setAppState: Dispatch<SetStateAction<AppState>>
  setComposerValue: (value: string) => void
  setQuote: Dispatch<SetStateAction<QuoteState | null>>
  setSendPending: Dispatch<SetStateAction<boolean>>
}

export const submitMessage = async ({
  appendClientError,
  composerValue,
  quote,
  scroll,
  sendPending,
  setAppState,
  setComposerValue,
  setQuote,
  setSendPending,
}: Args) => {
  const text = composerValue.trim()
  if (!text || sendPending) return
  scroll.captureLayoutShift()
  setSendPending(true)
  setAppState((current) => ({ ...current, awaitingReply: true }))

  try {
    const payload: Record<string, unknown> = {
      text,
      clientLocale: navigator.language,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clientOffsetMinutes: new Date().getTimezoneOffset(),
      clientNowIso: new Date().toISOString(),
      ...(quote?.id ? { quote: quote.id } : {}),
    }
    const response = await fetchWithTimeout(
      '/api/input',
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      SEND_TIMEOUT_MS,
    )
    if (!response.ok)
      throw new Error(await readJsonError(response, UI_TEXT.sendFailed))
    setComposerValue('')
    setQuote(null)
  } catch (error) {
    appendClientError(error)
  } finally {
    setSendPending(false)
  }
}
