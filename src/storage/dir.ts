import { join } from 'node:path'

import { listFiles } from '../fs/list.js'

export const listJsonPaths = async (dir: string): Promise<string[]> => {
  const entries = await listFiles(dir)
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(dir, entry.name))
}
