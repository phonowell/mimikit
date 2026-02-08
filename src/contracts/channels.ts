import type { Task, TaskResult, UserInput } from '../types/index.js'

export type ChannelName =
  | 'user-input'
  | 'worker-result'
  | 'teller-digest'
  | 'thinker-decision'

export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}

export type TaskStatusSummary = {
  pending: number
  running: number
  succeeded: number
  failed: number
  canceled: number
  recent: Array<{
    id: string
    title: string
    status: Task['status']
    profile: Task['profile']
    changedAt: string
  }>
}

export type TellerDigest = {
  digestId: string
  summary: string
  inputs: UserInput[]
  results: TaskResult[]
  taskSummary: TaskStatusSummary
}

export type ThinkerDecision = {
  digestId: string
  decision: string
  inputIds: string[]
  taskSummary: TaskStatusSummary
}
