import { expect, test } from 'vitest'

import { parseStandardStep } from '../src/worker/standard-step.js'

test('parseStandardStep parses action from actions block', () => {
  const output = [
    '<MIMIKIT:actions>',
    '@edit_file path="a.ts" old_text="before" new_text="after" replace_all="true"',
    '</MIMIKIT:actions>',
  ].join('\n')
  const step = parseStandardStep(output)
  expect(step).toEqual({
    kind: 'action',
    actionCall: {
      name: 'edit_file',
      args: {
        path: 'a.ts',
        old_text: 'before',
        new_text: 'after',
        replace_all: true,
      },
    },
  })
})

test('parseStandardStep rejects invalid boolean attr', () => {
  expect(() =>
    parseStandardStep(
      '@edit_file path="a.ts" old_text="a" new_text="b" replace_all="yes"',
    ),
  ).toThrowError('standard_action_attr_invalid:replace_all')
})

test('parseStandardStep rejects unknown action', () => {
  expect(() => parseStandardStep('@unknown any="1"')).toThrowError(
    'standard_step_unknown_action:unknown',
  )
})
