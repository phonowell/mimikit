import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('fire-keeper/exec', () => ({
  default: vi.fn(),
}))

import exec from 'fire-keeper/exec'

import { runBrowserSpec } from '../src/actions/defs/browser/run.js'

type ExecResult = [number, string, string[]]

beforeEach(() => {
  vi.mocked(exec).mockReset()
})

test('run_browser runs browser command once and returns success output', async () => {
  vi.mocked(exec).mockResolvedValueOnce([
    0,
    '{"success":true,"data":{"url":"https://example.com"}}',
    ['{"success":true,"data":{"url":"https://example.com"}}'],
  ] as ExecResult)

  const result = await runBrowserSpec.run(
    { workDir: '/tmp/workdir' },
    { command: 'open https://example.com' },
  )

  expect(result.ok).toBe(true)
  expect(result.output).toContain('"success":true')
  expect(vi.mocked(exec)).toHaveBeenCalledTimes(1)
  expect(vi.mocked(exec).mock.calls[0]?.[0]).toEqual([
    'cd "/tmp/workdir"',
    'pnpm exec agent-browser open https://example.com --json',
  ])
})

test('run_browser returns original failure without retrying', async () => {
  vi.mocked(exec).mockResolvedValueOnce([
    1,
    '{"success":false,"data":null,"error":"net::ERR_NAME_NOT_RESOLVED"}',
    ['{"success":false,"data":null,"error":"net::ERR_NAME_NOT_RESOLVED"}'],
  ] as ExecResult)

  const result = await runBrowserSpec.run(
    { workDir: '/tmp/workdir' },
    { command: 'open https://unknown.invalid' },
  )

  expect(result.ok).toBe(false)
  expect(result.error).toBe('browser_exit_1')
  expect(result.details?.command).toBe('open https://unknown.invalid')
  expect(vi.mocked(exec)).toHaveBeenCalledTimes(1)
})
