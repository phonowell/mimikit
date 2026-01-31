import { readdir } from 'node:fs/promises'

import type { Dirent } from 'node:fs'

export const listFiles = async (dir: string): Promise<Dirent[]> => {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}
