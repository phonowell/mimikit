export type Usage = { input?: number; output?: number; total?: number }

export type HistoryMessage = {
  id: string
  role: 'user' | 'agent'
  text: string
  createdAt: string
  usage?: Usage
  elapsedMs?: number
}

export type LlmValidation = {
  pass: boolean
  score: number
  reason: string
  elapsedMs?: number
  usage?: Usage
}

export type CaseResult = {
  id: string
  name: string
  ok: boolean
  latencyMs?: number
  tellerElapsedMs?: number
  usage?: Usage
  qualityScore?: number
  qualityReason?: string
  responseSnippet?: string
  error?: string
  llmValidation?: LlmValidation
}

export type Report = {
  startedAt: string
  endedAt: string
  durationMs: number
  config: {
    port: number
    stateDir: string
    workDir: string
    model?: string
    phase?: 'all' | 'code' | 'llm'
    failFast?: boolean
    segments?: { id: string; cases: string[] }[]
  }
  aborted?: boolean
  abortReason?: string
  cases: CaseResult[]
  totals: {
    passed: number
    failed: number
    avgLatencyMs?: number
    usage: Usage
  }
}
