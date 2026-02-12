import { runProfiledWorker } from './profiled-runner.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runStandardWorker = (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> =>
  runProfiledWorker({
    ...params,
    provider: 'opencode',
    profile: 'standard',
  })
