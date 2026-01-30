import { readFile, writeFile } from 'node:fs/promises'

import type { ProtocolPaths } from './protocol-paths.js'
import type { AgentState } from './protocol-types.js'

export const getAgentState = async (
  paths: ProtocolPaths,
): Promise<AgentState> => {
  try {
    const data = await readFile(paths.agentStatePath, 'utf-8')
    return JSON.parse(data) as AgentState
  } catch {
    return { status: 'idle' }
  }
}

export const setAgentState = async (
  paths: ProtocolPaths,
  state: AgentState,
): Promise<void> => {
  await writeFile(paths.agentStatePath, JSON.stringify(state, null, 2))
}
