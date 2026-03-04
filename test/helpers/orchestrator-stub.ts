import type { Orchestrator } from '../../src/orchestrator/core/orchestrator-service.js'
import type { UserMeta } from '../../src/orchestrator/core/runtime-state.js'

export const createOrchestratorStub = () => {
  const addInputCalls: Array<{ text: string; meta: UserMeta; quote?: string }> =
    []
  const exitRequests: Array<{ code: number; reason: string }> = []
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
    addUserInput: async (text: string, meta: UserMeta, quote?: string) => {
      addInputCalls.push({ text, meta, quote })
      return 'input-1'
    },
    getChatHistory: async () => [],
    getChatMessages: async () => ({ messages: [], mode: 'full' as const }),
    getTasks: () => ({ tasks: [], counts: {} }),
    getPlans: () => ({ items: [] }),
    getFocuses: () => ({ items: [] }),
    getPendingUserChoice: () => null,
    getWebUiWakeVersion: () => 0,
    waitForWebUiSignal: async () =>
      ({ kind: 'timeout', version: 0 }) as const,
    getWebUiSnapshot: async () => ({
      status: {
        ok: true,
        runtimeId: 'runtime-stub-1',
        agentStatus: 'idle',
        activeTasks: 0,
        pendingTasks: 0,
        pendingInputs: 0,
        managerRunning: false,
        maxWorkers: 1,
      },
      messages: [],
      tasks: { tasks: [], counts: {} },
      plans: { items: [] },
      focuses: { items: [] },
      choice: null,
    }),
    getTaskById: () => undefined,
    cancelTask: async () => ({ ok: false, status: 'not_found' as const }),
    selectPendingUserChoice: async () =>
      ({ ok: false, reason: 'not_found' as const }),
    stopAndPersist: async () => undefined,
    requestExit: (code: number, reason: string) => {
      exitRequests.push({ code, reason })
    },
  } as unknown as Orchestrator
  return { orchestrator, addInputCalls, exitRequests }
}
