import { mkdir } from 'node:fs/promises'

import type { ProtocolPaths } from './protocol-paths.js'

export const initProtocol = async (paths: ProtocolPaths): Promise<void> => {
  await mkdir(paths.stateDir, { recursive: true })
  await mkdir(paths.taskResultsDir, { recursive: true })
  await mkdir(paths.pendingTasksDir, { recursive: true })
  await mkdir(paths.inflightTasksDir, { recursive: true })
}
