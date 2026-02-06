import type {
  HistoryMessage,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

export const ReplayExitCode = {
  Success: 0,
  AssertionFailed: 1,
  RuntimeError: 2,
} as const

export type ReplayExitCode =
  (typeof ReplayExitCode)[keyof typeof ReplayExitCode]

export type ReplayCommandLimit = {
  min?: number
  max?: number
}

export type ReplayOutputExpect = {
  mustContain?: string[]
  mustNotContain?: string[]
}

export type ReplayCaseExpect = {
  commands?: Record<string, ReplayCommandLimit>
  output?: ReplayOutputExpect
}

export type ReplayCase = {
  id: string
  description?: string
  history: HistoryMessage[]
  inputs: UserInput[]
  tasks: Task[]
  results: TaskResult[]
  expect?: ReplayCaseExpect
}

export type ReplaySuite = {
  suite: string
  version: number
  cases: ReplayCase[]
}

export type ReplayAssertionKind =
  | 'command-min'
  | 'command-max'
  | 'output-must-contain'
  | 'output-must-not-contain'

export type ReplayAssertionResult = {
  kind: ReplayAssertionKind
  target: string
  passed: boolean
  message: string
}

export type ReplayCaseStatus = 'passed' | 'failed' | 'error'

export type ReplayCaseReport = {
  id: string
  description?: string
  status: ReplayCaseStatus
  elapsedMs: number
  outputChars: number
  commandStats: Record<string, number>
  assertions: ReplayAssertionResult[]
  error?: string
}

export type ReplayReport = {
  suite: string
  version: number
  runAt: string
  model?: string
  total: number
  passed: number
  failed: number
  passRate: number
  stoppedEarly: boolean
  maxFail: number
  cases: ReplayCaseReport[]
}

export class ReplaySuiteFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReplaySuiteFormatError'
  }
}
