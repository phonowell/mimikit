import { expect, test } from 'vitest'

import { buildQuotePreviewState } from '../webui-src/components/Composer.js'

test('composer quote preview state becomes visible and role-aware when quoted', () => {
  expect(buildQuotePreviewState(true, 'user')).toEqual({
    className: 'quote-preview is-visible',
    dataRole: 'user',
  })
})
