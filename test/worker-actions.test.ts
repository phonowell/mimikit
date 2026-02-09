import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createPatch } from 'diff'
import { expect, test } from 'vitest'

import { listInvokableActionNames } from '../src/actions/registry/index.js'
import { invokeAction } from '../src/actions/runtime/invoke.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-actions-'))

test('action registry exposes expected invokable actions', () => {
  expect(listInvokableActionNames()).toEqual([
    'read_file',
    'search_files',
    'write_file',
    'edit_file',
    'patch_file',
    'exec_shell',
    'run_browser',
  ])
})

test('read_file supports line window with defaults and bounds', async () => {
  const workDir = await createTmpDir()
  const path = 'chunk.txt'
  const content = Array.from({ length: 220 }, (_v, index) => `line-${index + 1}`).join('\n')
  await invokeAction({ workDir }, 'write_file', { path, content })

  const defaultRead = await invokeAction({ workDir }, 'read_file', { path })
  expect(defaultRead.ok).toBe(true)
  expect(defaultRead.output.split('\n')).toHaveLength(100)

  const rangedRead = await invokeAction(
    { workDir },
    'read_file',
    { path, start_line: 150, line_count: 3 },
  )
  expect(rangedRead.ok).toBe(true)
  expect(rangedRead.output).toBe('line-150\nline-151\nline-152')

  const overflow = await invokeAction(
    { workDir },
    'read_file',
    { path, line_count: 501 },
  )
  expect(overflow.ok).toBe(false)
  expect(overflow.error).toBe('action_arg_invalid:line_count')
})

test('search_files finds matching lines with glob', async () => {
  const workDir = await createTmpDir()
  await invokeAction(
    { workDir },
    'write_file',
    { path: 'a.txt', content: 'TODO: one\nkeep\nTODO: two' },
  )
  await invokeAction(
    { workDir },
    'write_file',
    { path: 'b.md', content: 'ignore me' },
  )

  const result = await invokeAction(
    { workDir },
    'search_files',
    { pattern: 'TODO', path_glob: '**/*.txt', max_results: 10 },
  )

  expect(result.ok).toBe(true)
  expect(result.output).toContain('a.txt:1:TODO: one')
  expect(result.output).toContain('a.txt:3:TODO: two')
  expect(result.output).not.toContain('b.md')
})

test('write/read/edit roundtrip', async () => {
  const workDir = await createTmpDir()
  const path = 'notes.txt'

  const writeResult = await invokeAction(
    { workDir },
    'write_file',
    { path, content: 'hello world' },
  )
  expect(writeResult.ok).toBe(true)

  const readResult = await invokeAction({ workDir }, 'read_file', { path })
  expect(readResult.ok).toBe(true)
  expect(readResult.output).toContain('hello world')

  const editResult = await invokeAction(
    { workDir },
    'edit_file',
    {
      path,
      old_text: 'world',
      new_text: 'worker-standard',
      replace_all: false,
    },
  )
  expect(editResult.ok).toBe(true)

  const file = await readFile(join(workDir, path), 'utf8')
  expect(file).toContain('hello worker-standard')
})

test('patch_file applies unified diff through third-party engine', async () => {
  const workDir = await createTmpDir()
  const path = 'patch-target.txt'
  await invokeAction(
    { workDir },
    'write_file',
    { path, content: 'alpha\nbeta\n' },
  )

  const patch = createPatch(
    path,
    'alpha\nbeta\n',
    'alpha\ngamma\n',
  )
  const patched = await invokeAction(
    { workDir },
    'patch_file',
    { path, patch },
  )
  expect(patched.ok).toBe(true)

  const file = await readFile(join(workDir, path), 'utf8')
  expect(file).toBe('alpha\ngamma\n')
})

test('exec action runs command in workdir', async () => {
  const workDir = await createTmpDir()
  const result = await invokeAction(
    { workDir },
    'exec_shell',
    { command: 'echo alpha && echo beta' },
  )
  expect(result.ok).toBe(true)
  expect(result.output).toContain('alpha')
  expect(result.output).toContain('beta')
})

test('action args reject unknown keys', async () => {
  const workDir = await createTmpDir()
  const result = await invokeAction(
    { workDir },
    'write_file',
    { path: 'notes.txt', content: 'hello', extra: true },
  )
  expect(result.ok).toBe(false)
  expect(result.error).toBe('action_arg_invalid:extra')
})

test('action args reject missing required fields', async () => {
  const workDir = await createTmpDir()
  const result = await invokeAction(
    { workDir },
    'edit_file',
    { path: 'a.txt', old_text: 'a', new_text: 'b' },
  )
  expect(result.ok).toBe(false)
  expect(result.error).toBe('action_arg_invalid:replace_all')
})
