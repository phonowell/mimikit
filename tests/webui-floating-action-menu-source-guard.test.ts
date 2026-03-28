import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

const source = readFileSync(
  new URL('../webui-src/components/FloatingActionMenu.tsx', import.meta.url),
  'utf8',
)

test('floating action menu keeps effect events out of reactive dependency arrays', () => {
  expect(source).toContain('const updateMenuLayout = useEffectEvent(() => {')
  expect(source).not.toContain('}, [menuOpen, toggleRef, updateMenuLayout])')
  expect(source).not.toContain('}, [menuOpen, portalHost, updateMenuLayout])')
})
