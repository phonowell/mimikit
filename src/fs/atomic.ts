import { copyFile } from 'node:fs/promises'

import writeFileAtomicLib from 'write-file-atomic'

import { logSafeError } from '../log/safe.js'

export const writeFileAtomic = async (
  path: string,
  content: string,
  opts?: { backup?: boolean },
): Promise<void> => {
  if (opts?.backup) {
    try {
      await copyFile(path, `${path}.bak`)
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (code !== 'ENOENT') {
        await logSafeError('writeFileAtomic: backup', error, {
          meta: { path },
        })
        throw error
      }
    }
  }
  await writeFileAtomicLib(path, content, { encoding: 'utf8' })
}
