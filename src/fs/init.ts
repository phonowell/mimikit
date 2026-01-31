import { ensureDir } from './ensure.js'

import type { StatePaths } from './paths.js'

export const ensureStateDirs = async (paths: StatePaths): Promise<void> => {
  await ensureDir(paths.root)
  await ensureDir(paths.memoryDir)
  await ensureDir(paths.memorySummaryDir)
  await ensureDir(paths.plannerQueue)
  await ensureDir(paths.plannerRunning)
  await ensureDir(paths.plannerResults)
  await ensureDir(paths.workerQueue)
  await ensureDir(paths.workerRunning)
  await ensureDir(paths.workerResults)
  await ensureDir(paths.triggers)
  await ensureDir(paths.llmDir)
}
