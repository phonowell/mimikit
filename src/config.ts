import { resolve } from 'node:path'

export type Timeouts = {
  tellerMs: number
  plannerMs: number
  workerMs: number
  llmEvalMs: number
}

export type Limits = {
  historySoft: number
  historyHardCount: number
  historyHardBytes: number
}

export type MemorySearchConfig = {
  bm25K1: number
  bm25B: number
  minScore: number
  maxHits: number
}

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  model?: string
  checkIntervalMs: number
  timeouts: Timeouts
  limits: Limits
  memorySearch: MemorySearchConfig
}

export const defaultConfig = (params: {
  stateDir: string
  workDir: string
  model?: string | undefined
  checkIntervalMs?: number | undefined
}): SupervisorConfig => {
  const base: SupervisorConfig = {
    stateDir: resolve(params.stateDir),
    workDir: resolve(params.workDir),
    checkIntervalMs: params.checkIntervalMs ?? 1000,
    timeouts: {
      tellerMs: 2 * 60 * 1000,
      plannerMs: 10 * 60 * 1000,
      workerMs: 10 * 60 * 1000,
      llmEvalMs: 2 * 60 * 1000,
    },
    limits: {
      historySoft: 200,
      historyHardCount: 300,
      historyHardBytes: 10 * 1024 * 1024,
    },
    memorySearch: {
      bm25K1: 1.2,
      bm25B: 0.75,
      minScore: 0.2,
      maxHits: 5,
    },
  }
  if (params.model) return { ...base, model: params.model }
  return base
}
