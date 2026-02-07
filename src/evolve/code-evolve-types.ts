import type { TokenUsage } from '../types/index.js'

export type EvolveCodeInstruction =
  | {
      mode: 'skip'
    }
  | {
      mode: 'code'
      target: string
      prompt: string
    }

export type ValidationStep = {
  command: string
  ok: boolean
  elapsedMs: number
}

export type GitChanges = {
  tracked: string[]
  untracked: string[]
}

export type CodeEvolveRoundResult = {
  applied: boolean
  reason: string
  output: string
  usage?: TokenUsage
  llmElapsedMs: number
  changedPaths: GitChanges
  validation: {
    ok: boolean
    steps: ValidationStep[]
  }
  changedFiles: number
}
