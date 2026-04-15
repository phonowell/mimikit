import { afterEach, expect, test, vi } from 'vitest'

import {
  REPO_QUALITY_REFRESH_MS,
  startRepoQualityAutoRefresh,
} from '../webui-src/hooks/use-repo-quality.js'

const SUMMARY =
  'Repo src 19.5k/20.0k · tests 8.0k · webui 1.0k · prompts 5 · max file 180'
const noop = (): undefined => undefined

afterEach(() => {
  vi.useRealTimers()
})

test('repo quality refresh retries after an initial failed load', async () => {
  vi.useFakeTimers()
  const setSummary = vi.fn<(summary: string) => void>()
  const loadSummary = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce('')
    .mockResolvedValueOnce(SUMMARY)

  const stop = startRepoQualityAutoRefresh({
    loadSummary,
    setSummary,
    addWindowListener: () => noop,
    addDocumentListener: () => noop,
    isDocumentVisible: () => true,
  })

  await vi.waitFor(() => {
    expect(loadSummary).toHaveBeenCalledTimes(1)
  })
  expect(setSummary).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(REPO_QUALITY_REFRESH_MS)

  expect(loadSummary).toHaveBeenCalledTimes(2)
  expect(setSummary).toHaveBeenCalledWith(SUMMARY)

  stop()
})

test('repo quality refresh keeps the last good summary when a later refresh fails', async () => {
  vi.useFakeTimers()
  const setSummary = vi.fn<(summary: string) => void>()
  const loadSummary = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce(SUMMARY)
    .mockResolvedValueOnce('')
  let triggerFocus: () => void = noop

  const stop = startRepoQualityAutoRefresh({
    loadSummary,
    setSummary,
    addWindowListener: (_type, listener) => {
      triggerFocus = listener
      return noop
    },
    addDocumentListener: () => noop,
    isDocumentVisible: () => true,
  })

  await vi.waitFor(() => {
    expect(setSummary).toHaveBeenCalledWith(SUMMARY)
  })

  triggerFocus()
  await vi.waitFor(() => {
    expect(loadSummary).toHaveBeenCalledTimes(2)
  })
  expect(setSummary).toHaveBeenCalledTimes(1)

  stop()
})
