import { readdir } from 'node:fs/promises'

import { safe } from '../log/safe.js'

import type { Dirent } from 'node:fs'

export const listFiles = (dir: string): Promise<Dirent[]> =>
  safe('listFiles: readdir', () => readdir(dir, { withFileTypes: true }), {
    fallback: [],
    meta: { dir },
  })
