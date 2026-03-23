import type { Role } from '../../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type MemoryRefreshSignal = {
  id: string
  role: Role
  createdAt: string
  text: string
}

export type MemoryRefreshPayload = {
  workDir: string
  model: string
  baseUrl?: string | undefined
  apiKey?: string | undefined
  proxy?: string | undefined
  modelReasoningEffort?: ModelReasoningEffort | undefined
  memoryMarkdown: string
  signals: MemoryRefreshSignal[]
}

export type MemoryEvidenceEntry = {
  title: string
  content: string
  evidenceIds: string[]
}

export type MemoryRefreshMode = 'patch' | 'noop'

export type MemoryRefreshStageSummary = {
  mode: MemoryRefreshMode
  reason: string
}

export type MemoryRefreshSubprocessResult = {
  mode: MemoryRefreshMode
  reason: string
  entries: MemoryEvidenceEntry[]
  deleteEntryIds: string[]
  harvest: MemoryRefreshStageSummary
  curate: MemoryRefreshStageSummary
  compress: MemoryRefreshStageSummary
}
