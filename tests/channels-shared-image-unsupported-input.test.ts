import { expect, test } from 'vitest'

import { buildUnsupportedImageInputText } from '../src/channels/shared/image-unsupported-input.js'

test('shared image unsupported prompt renderer loads template and injects field', async () => {
  const text = await buildUnsupportedImageInputText({
    promptPath: 'manager/feishu-image-unsupported-input.md',
    fieldName: 'text',
    fieldValue: 'image_key=img_123',
  })

  expect(text).toContain('Feishu')
  expect(text).toContain('image_key=img_123')
})
