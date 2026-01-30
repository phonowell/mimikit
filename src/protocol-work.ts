import { getUserInputs } from './protocol-inputs.js'
import { getTaskResults } from './protocol-results.js'

import type { ProtocolPaths } from './protocol-paths.js'

export const hasPendingWork = async (
  paths: ProtocolPaths,
): Promise<boolean> => {
  const [inputs, results] = await Promise.all([
    getUserInputs(paths),
    getTaskResults(paths),
  ])
  return inputs.length > 0 || results.length > 0
}
