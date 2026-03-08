import { expect, test, vi } from 'vitest'

import { copyTaskIdToClipboard } from '../webui/tasks-copy-id.js'

test('copyTaskIdToClipboard writes to clipboard and returns success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  const result = await copyTaskIdToClipboard('task-123', {
    isSecureContext: true,
    navigator: { clipboard: { writeText } },
  })
  expect(writeText).toHaveBeenCalledTimes(1)
  expect(writeText).toHaveBeenCalledWith('task-123')
  expect(result.ok).toBe(true)
  expect(result.code).toBe('copied')
})

test('copyTaskIdToClipboard handles insecure context with manual fallback', async () => {
  const prompt = vi.fn()
  const result = await copyTaskIdToClipboard('task-abc', {
    isSecureContext: false,
    prompt,
  })
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(result.ok).toBe(false)
  expect(result.code).toBe('insecure-context')
  expect(result.message.toLowerCase()).toContain('https')
})

test('copyTaskIdToClipboard handles clipboard api unavailable', async () => {
  const prompt = vi.fn()
  const result = await copyTaskIdToClipboard('task-abc', {
    isSecureContext: true,
    navigator: {},
    prompt,
  })
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(result.ok).toBe(false)
  expect(result.code).toBe('clipboard-unavailable')
})

test('copyTaskIdToClipboard handles permission denied error', async () => {
  const prompt = vi.fn()
  const writeText = vi.fn().mockRejectedValue(
    Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
  )
  const result = await copyTaskIdToClipboard('task-abc', {
    isSecureContext: true,
    navigator: { clipboard: { writeText } },
    prompt,
  })
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(result.ok).toBe(false)
  expect(result.code).toBe('permission-denied')
})
