import type { ChatMessage, TaskResult, UserInput } from './protocol.js'

export type AgentContext = {
  userInputs: UserInput[]
  taskResults: TaskResult[]
  chatHistory: ChatMessage[]
  memoryHits: string
  isSelfAwake: boolean
}

export type AgentConfig = {
  stateDir: string
  workDir: string
  model?: string | undefined
  timeout?: number | undefined
  memoryPaths?: string[] | undefined
}
