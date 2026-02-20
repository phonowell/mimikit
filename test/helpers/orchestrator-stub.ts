import type { ChatMessage, ChatMessagesMode } from '../../src/orchestrator/read-model/chat-view.js'
import type { InputMeta } from '../../src/http/helpers.js'
import type { Orchestrator } from '../../src/orchestrator/core/orchestrator-service.js'

export const createOrchestratorStub = () => {
  const calls: Array<{ limit: number; afterId?: string }> = []
  const taskLimitCalls: number[] = []
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
    getChatMessages: async (limit: number, afterId?: string) => {
      calls.push({ limit, afterId })
      const message: ChatMessage = {
        id: afterId ? 'delta-1' : 'full-1',
        role: 'assistant',
        text: 'ok',
        createdAt: '2026-02-08T00:00:00.000Z',
      }
      const mode: ChatMessagesMode = afterId ? 'delta' : 'full'
      return { messages: [message], mode }
    },
    getTasks: (limit: number) => {
      taskLimitCalls.push(limit)
      return { tasks: [], counts: {} }
    },
    getTaskById: () => undefined,
    cancelTask: async () => ({ ok: false, status: 'not_found' as const }),
    stopAndPersist: async () => undefined,
  } as unknown as Orchestrator
  return { orchestrator, calls, taskLimitCalls, addInputCalls }
}
