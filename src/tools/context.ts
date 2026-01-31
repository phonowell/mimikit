import type { StatePaths } from '../fs/paths.js'
import type { TokenUsage } from '../types/usage.js'

export type ToolRole = 'teller' | 'planner'

export type ToolContext = {
  role: ToolRole
  paths: StatePaths
  workDir: string
  now: Date
  llmUsage?: TokenUsage
  llmElapsedMs?: number
}
