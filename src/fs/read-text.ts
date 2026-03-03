import { readFile } from 'node:fs/promises'

import { readErrorCode } from '../shared/error-code.js'

export const toUtf8Text = (raw: unknown): string => {
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  return ''
}

export const readTextFile = async (path: string): Promise<string> =>
  toUtf8Text(await readFile(path))

export const readTextFileIfExists = async (path: string): Promise<string> => {
  try {
    return await readTextFile(path)
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return ''
    throw error
  }
}
