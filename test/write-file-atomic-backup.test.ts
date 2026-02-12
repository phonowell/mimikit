import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('fire-keeper/copy', () => ({
  default: vi.fn(),
}))

import copy from 'fire-keeper/copy'

import { writeFileAtomic } from '../src/fs/json.js'

const makeCodeError = (code: string, message: string): Error & { code: string } => {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

const makeTmpPath = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-write-file-atomic-'))
  return join(dir, 'state.json')
}

beforeEach(() => {
  vi.mocked(copy).mockReset()
})

test('writeFileAtomic ignores aggregate ENOENT backup failure', async () => {
  vi.mocked(copy).mockRejectedValueOnce(
    new AggregateError(
      [makeCodeError('ENOENT', 'source file disappeared')],
      'Some tasks failed to execute',
    ),
  )
  const path = await makeTmpPath()
  await expect(
    writeFileAtomic(path, '{"ok":true}\n', { backup: true }),
  ).resolves.toBeUndefined()
  await expect(readFile(path, 'utf8')).resolves.toBe('{"ok":true}\n')
  expect(vi.mocked(copy)).toHaveBeenCalledWith(path, `${path}.bak`)
})

test('writeFileAtomic throws when aggregate backup error is not ENOENT', async () => {
  vi.mocked(copy).mockRejectedValueOnce(
    new AggregateError(
      [makeCodeError('EACCES', 'permission denied')],
      'Some tasks failed to execute',
    ),
  )
  const path = await makeTmpPath()
  await expect(
    writeFileAtomic(path, '{"ok":true}\n', { backup: true }),
  ).rejects.toBeInstanceOf(AggregateError)
})

test('writeFileAtomic throws when aggregate backup error includes unknown child', async () => {
  vi.mocked(copy).mockRejectedValueOnce(
    new AggregateError(
      [makeCodeError('ENOENT', 'source file disappeared'), new Error('unknown error')],
      'Some tasks failed to execute',
    ),
  )
  const path = await makeTmpPath()
  await expect(
    writeFileAtomic(path, '{"ok":true}\n', { backup: true }),
  ).rejects.toBeInstanceOf(AggregateError)
})
