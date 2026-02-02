import { resolve } from 'node:path'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  teller: {
    pollMs: number
    debounceMs: number
    maxNoticeWaitMs: number
    model: string
  }
  thinker: {
    settleMs: number
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
  }
}

export const defaultConfig = (params: {
  stateDir: string
  workDir: string
}): SupervisorConfig => ({
  stateDir: resolve(params.stateDir),
  workDir: resolve(params.workDir),
  teller: {
    pollMs: 1000,
    debounceMs: 2000,
    maxNoticeWaitMs: 5000,
    model: 'qwen2.5:7b',
  },
  thinker: {
    settleMs: 30_000,
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 10 * 60 * 1000,
  },
})
