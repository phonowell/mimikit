export type ToolName =
  | 'delegate'
  | 'reply'
  | 'remember'
  | 'get_recent_history'
  | 'get_history_by_time'
  | 'search_memory'
  | 'ask_user'
  | 'schedule'
  | 'list_tasks'
  | 'cancel_task'

export type ToolCall = {
  tool: ToolName
  args: unknown
}
