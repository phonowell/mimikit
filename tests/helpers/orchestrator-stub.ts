import type { Orchestrator } from '../../src/kernel/orchestrator/orchestrator-service.js'
import type { UserMeta } from '../../src/kernel/orchestrator/runtime-state.js'

export const createOrchestratorStub = () => {
  const addInputCalls: Array<{ text: string; meta: UserMeta; quote?: string }> =
    []
  const exitRequests: Array<{
    code: number
    reason: string
    skipPersist?: boolean
  }> = []
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
    addUserInput: (text: string, meta: UserMeta, quote?: string) => {
      addInputCalls.push({ text, meta, quote })
      return Promise.resolve('input-1')
    },
    getChatHistory: () => Promise.resolve([]),
    getChatMessages: () =>
      Promise.resolve({ messages: [], mode: 'full' as const }),
    getTasks: () => ({ tasks: [], counts: {} }),
    getPlans: () => ({ items: [] }),
    getReviewStatus: () => Promise.resolve({ cards: [], highlights: [] }),
    getWebUiDeltaSnapshot: () =>
      Promise.resolve({
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
        messages: { messages: [], mode: 'full' as const },
        tasks: { tasks: [], counts: {} },
        plans: { items: [] },
      }),
    getWebUiWakeVersion: () => 0,
    waitForWebUiSignal: () =>
      Promise.resolve({ kind: 'timeout', version: 0 } as const),
    getWebUiSnapshot: () =>
      Promise.resolve({
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
        reviewStatus: { cards: [], highlights: [] },
      }),
    getTaskById: () => undefined,
    getTaskLiveOutput: () => undefined,
    mutateTask: (
      _action: 'cancel' | 'delete' | 'pause' | 'resume',
      taskId: string,
    ) =>
      Promise.resolve({
        ok: false,
        id: taskId,
        status: 'not_found' as const,
      }),
    stopAndPersist: () => Promise.resolve(),
    requestExit: (
      code: number,
      reason: string,
      options?: { skipPersist?: boolean },
    ) => {
      exitRequests.push({
        code,
        reason,
        ...(options?.skipPersist ? { skipPersist: true } : {}),
      })
    },
  } as unknown as Orchestrator
  return { orchestrator, addInputCalls, exitRequests }
}
