export type ISODate = string
export type Id = string
export type FocusId = string

export type TokenUsage = {
  input?: number | undefined
  inputCacheRead?: number | undefined
  inputCacheWrite?: number | undefined
  output?: number | undefined
  outputCache?: number | undefined
  total?: number | undefined
  sessionTotal?: number | undefined
}

export type Role = 'user' | 'agent' | 'system'
export type MessageVisibility = 'user' | 'agent' | 'all'
export type WorkerProfile = 'worker'
export type ProviderCapability = 'low' | 'medium' | 'high'
export type ProviderBilling = 'free' | 'low' | 'medium' | 'high'
export type PlanPriority = 'high' | 'normal' | 'low'
export type PlanSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type UserChoiceSelectionSource = 'user' | 'timeout'

export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}
