import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { formatEnvironment } from '../src/prompts/format.js'

test('formatEnvironment exposes generated_dir derived from work_dir', () => {
  const workDir = resolve('/tmp/mimikit/.mimikit')
  const output = formatEnvironment({ workDir })

  expect(output).toContain(`- work_dir: ${workDir}`)
  expect(output).toContain(`- generated_dir: ${resolve(workDir, 'generated')}`)
})

test('formatEnvironment omits work_dir and generated_dir when work_dir is missing', () => {
  const output = formatEnvironment()

  expect(output).not.toContain('work_dir:')
  expect(output).not.toContain('generated_dir:')
})
