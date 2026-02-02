import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'

export const loadTemplate = async (
  workDir: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'docs', 'prompts', name)
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return ''
    await logSafeError('loadTemplate', error, { meta: { path } })
    throw error
  }
}
