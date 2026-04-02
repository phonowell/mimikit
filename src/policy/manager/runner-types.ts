import type {
  ManagerTurnAction,
  ManagerTurnDecision,
} from './manager-turn-schema.js'
import type {
  ManagerContextPacket,
  TokenUsage,
} from '../../foundation/types/index.js'
import type {
  PromptSectionUsage,
  PromptSelectionSummary,
} from '../prompts/manager-prompt-types.js'

export type ManagerRetryPolicy = {
  maxAttempts: number
  backoffMs: number
}

export type RunManagerResult = {
  output: string
  actions: ManagerTurnAction[]
  decision?: ManagerTurnDecision
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
  contextPacket: ManagerContextPacket
  promptBytes: number
  promptSegmentCount: number
  promptSections: PromptSectionUsage
  promptSelection: PromptSelectionSummary
  traceRef?: string
  providerCallId?: string
  attempt?: number
  batchId?: string
  roundId?: string
}
