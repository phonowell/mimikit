import { copyFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { logSafeError } from '../log/safe.js'

export const writeFileAtomic = async (
  path: string,
  content: string,
  opts?: { backup?: boolean },
): Promise<void> => {
  const dir = dirname(path)
  const tmp = join(
    dir,
    `${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  )
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
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}
