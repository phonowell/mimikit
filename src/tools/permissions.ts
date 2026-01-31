import type { ToolRole } from './context.js'
import type { ToolName } from '../types/tools.js'

export const toolPermissions: Record<ToolName, ToolRole[]> = {
  delegate: ['teller', 'planner'],
  reply: ['teller'],
  remember: ['teller'],
  get_recent_history: ['planner'],
  get_history_by_time: ['planner'],
  search_memory: ['planner'],
  ask_user: ['teller'],
  schedule: ['planner'],
  list_tasks: ['teller', 'planner'],
  cancel_task: ['teller', 'planner'],
}

export const canUseTool = (tool: ToolName, role: ToolRole): boolean =>
  toolPermissions[tool].includes(role)
