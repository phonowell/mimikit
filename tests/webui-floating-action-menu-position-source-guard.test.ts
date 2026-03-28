import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

const source = readFileSync(
  new URL('../webui-src/components/FloatingActionMenu.tsx', import.meta.url),
  'utf8',
)

test('floating action menu measures its real height before upward placement', () => {
  expect(source).toContain('const menuHeight =')
  expect(source).toContain('menuRef.current?.getBoundingClientRect().height')
  expect(source).toContain('rect.top - menuHeight - ACTION_MENU_OFFSET')
})
