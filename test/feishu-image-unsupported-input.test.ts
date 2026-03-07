import { expect, test } from 'vitest'

import { buildUnsupportedImageInputText } from '../src/channels/feishu/image-unsupported-input.js'

test('buildUnsupportedImageInputText returns feishu-specific prompt', async () => {
  const text = await buildUnsupportedImageInputText('image_key=img_1')
  expect(text).toContain('Feishu')
  expect(text).toContain('image input is not supported')
})
