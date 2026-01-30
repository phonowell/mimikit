export type AgentState = {
  status: 'idle' | 'running'
  lastAwakeAt?: string | undefined
  lastSleepAt?: string | undefined
}

export type TokenUsage = {
  input?: number
  output?: number
  total?: number
}

export type PendingTask = {
  id: string
  prompt: string
  createdAt: string
  origin?: 'self-awake' | 'event'
  selfAwakeRunId?: string
}

export type TaskResult = {
  id: string
  status: 'done' | 'failed'
  prompt?: string
  createdAt?: string
  result?: string
  error?: string
  completedAt: string
  usage?: TokenUsage
  origin?: 'self-awake' | 'event'
  selfAwakeRunId?: string
}

export type UserInput = {
  id: string
  text: string
  createdAt: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'agent'
  text: string
  createdAt: string
  usage?: TokenUsage
}
