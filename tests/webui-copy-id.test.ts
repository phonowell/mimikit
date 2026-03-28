import { expect, test } from 'vitest'

import { copyPlanIdToClipboard } from '../webui-src/lib/tasks-copy-id.js'

test('copyPlanIdToClipboard copies the plan id and returns a plan-specific success message', async () => {
  let copied = ''
  const result = await copyPlanIdToClipboard('plan-42', {
    isSecureContext: true,
    navigator: {
      clipboard: {
        writeText: (value: string) => {
          copied = value
          return Promise.resolve()
        },
      },
    },
  })

  expect(copied).toBe('plan-42')
  expect(result).toEqual({
    ok: true,
    code: 'copied',
    message: 'Plan id copied',
  })
})
