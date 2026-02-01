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

export type ConcurrencyConfig = {
  teller: number
  planner: number
  worker: number
  internal: number
}

export type SchedulerConfig = {
  triggerCheckMs: number
  triggerStuckMs: number
  queueWarnDepth: number
  agingMs: number
  agingMaxBoost: number
}

export type TellerConfig = {
  debounceMs: number
  returnAfterMs: number
}

export type RetryConfig = {
  maxAttempts: number
  backoffMs: number
}

export type HttpConfig = {
  apiKey?: string | null
  allowStatusWithoutAuth: boolean
}

export type MemoryRetentionConfig = {
  autoPrune: boolean
  recentDays: number
  summaryDays: number
  keepLongTerm: boolean
}

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  model?: string
  checkIntervalMs: number
  timeouts: Timeouts
  limits: Limits
  memorySearch: MemorySearchConfig
  concurrency: ConcurrencyConfig
  scheduler: SchedulerConfig
  teller: TellerConfig
  retry: RetryConfig
  http: HttpConfig
  memoryRetention: MemoryRetentionConfig
}

const readEnvMs = (name: string): number | null => {
  const raw = process.env[name]
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
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
    checkIntervalMs: params.checkIntervalMs ?? 5000,
    timeouts: {
      tellerMs: readEnvMs('MIMIKIT_TELLER_TIMEOUT_MS') ?? 120 * 1000,
      plannerMs: readEnvMs('MIMIKIT_PLANNER_TIMEOUT_MS') ?? 10 * 60 * 1000,
      workerMs: readEnvMs('MIMIKIT_WORKER_TIMEOUT_MS') ?? 10 * 60 * 1000,
      llmEvalMs: readEnvMs('MIMIKIT_LLM_EVAL_TIMEOUT_MS') ?? 2 * 60 * 1000,
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
    concurrency: {
      teller: 1,
      planner: 1,
      worker: 3,
      internal: 1,
    },
    scheduler: {
      triggerCheckMs: 5000,
      triggerStuckMs: 2 * 60 * 60 * 1000,
      queueWarnDepth: 50,
      agingMs: 60 * 1000,
      agingMaxBoost: 5,
    },
    teller: {
      debounceMs: 800,
      returnAfterMs: 5 * 60 * 1000,
    },
    retry: {
      maxAttempts: 1,
      backoffMs: 0,
    },
    http: {
      apiKey: process.env.MIMIKIT_API_KEY ?? null,
      allowStatusWithoutAuth: true,
    },
    memoryRetention: {
      autoPrune: false,
      recentDays: 5,
      summaryDays: 180,
      keepLongTerm: true,
    },
  }
  if (params.model) return { ...base, model: params.model }
  return base
}
