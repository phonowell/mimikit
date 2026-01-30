import type { Protocol } from './protocol.js'

export const recoverSupervisor = async (protocol: Protocol): Promise<void> => {
  const state = await protocol.getAgentState()
  if (state.status === 'running') {
    await protocol.setAgentState({
      ...state,
      status: 'idle',
    })
    await protocol.appendTaskLog('supervisor:recover agent was running')
  }

  await protocol.restoreInflightTasks()
}
