import { defaultConfig } from './config.js'
import { createHttpServer } from './http/index.js'
import { Orchestrator } from './orchestrator/core/orchestrator-service.js'

import type { AppConfig } from './config.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from './types/index.js'

export { Orchestrator, defaultConfig, createHttpServer }
export type {
  AppConfig,
  HistoryMessage,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
}

export type OrchestratorStatus = ReturnType<Orchestrator['getStatus']>
export type OrchestratorHistory = Awaited<
  ReturnType<Orchestrator['getChatHistory']>
>

export const createOrchestrator = (config: AppConfig) =>
  new Orchestrator(config)

export const resolveDefaultConfig = (params: { workDir: string }): AppConfig =>
  defaultConfig(params)
