import { defaultConfig } from './config.js'
import { createHttpServer } from './http/index.js'
import { Supervisor } from './supervisor/supervisor.js'

import type { SupervisorConfig } from './config.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from './types/index.js'

export { Supervisor, defaultConfig, createHttpServer }
export type {
  SupervisorConfig,
  HistoryMessage,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
}

export type SupervisorStatus = ReturnType<Supervisor['getStatus']>
export type SupervisorHistory = Awaited<
  ReturnType<Supervisor['getChatHistory']>
>

export const createSupervisor = (config: SupervisorConfig) =>
  new Supervisor(config)

export const resolveDefaultConfig = (params: {
  stateDir: string
  workDir: string
}): SupervisorConfig => defaultConfig(params)
