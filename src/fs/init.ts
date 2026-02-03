import { ensureDir } from './ensure.js'

import type { StatePaths } from './paths.js'

export const ensureStateDirs = async (paths: StatePaths): Promise<void> => {
  await ensureDir(paths.root)
}
