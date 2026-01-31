import type { StatePaths } from '../fs/paths.js'

export type ToolRole = 'teller' | 'planner'

export type ToolContext = {
  role: ToolRole
  paths: StatePaths
  workDir: string
  now: Date
}
