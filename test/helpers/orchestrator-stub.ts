import type { InputMeta } from '../../src/http/helpers.js'
import type { Orchestrator } from '../../src/orchestrator/core/orchestrator-service.js'

export const createOrchestratorStub = () => {
  const addInputCalls: Array<{ text: string; meta: InputMeta; quote?: string }> =
    []
  const orchestrator = {
    getStatus: () => ({
      ok: true,
      runtimeId: 'runtime-stub-1',
      agentStatus: 'idle',
      activeTasks: 0,
      pendingTasks: 0,
      pendingInputs: 0,
      managerRunning: false,
      maxWorkers: 1,
    }),
    addUserInput: async (text: string, meta: InputMeta, quote?: string) => {
      addInputCalls.push({ text, meta, quote })
      return 'input-1'
    },
    getChatHistory: async () => [],
    getChatMessages: async () => ({ messages: [], mode: 'full' as const }),
    getTasks: () => ({ tasks: [], counts: {} }),
    getTodos: () => ({ items: [] }),
    getTaskById: () => undefined,
    cancelTask: async () => ({ ok: false, status: 'not_found' as const }),
    stopAndPersist: async () => undefined,
  } as unknown as Orchestrator
  return { orchestrator, addInputCalls }
}
