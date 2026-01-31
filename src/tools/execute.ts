import { askUser, type AskUserArgs } from './ask_user.js'
import { cancelTask, type CancelTaskArgs } from './cancel_task.js'
import { delegate, type DelegateArgs } from './delegate.js'
import {
  getHistoryByTime,
  type GetHistoryByTimeArgs,
} from './get_history_by_time.js'
import {
  getRecentHistory,
  type GetRecentHistoryArgs,
} from './get_recent_history.js'
import { listTasks, type ListTasksArgs } from './list_tasks.js'
import { canUseTool } from './permissions.js'
import { remember, type RememberArgs } from './remember.js'
import { reply, type ReplyArgs } from './reply.js'
import { schedule, type ScheduleArgs } from './schedule.js'
import { type SearchMemoryArgs, searchMemoryTool } from './search_memory.js'

import type { ToolContext } from './context.js'
import type { ToolCall } from '../types/tools.js'

export const executeTool = (ctx: ToolContext, call: ToolCall) => {
  if (!canUseTool(call.tool, ctx.role))
    throw new Error(`tool not allowed: ${String(call.tool)}`)

  switch (call.tool) {
    case 'delegate':
      return delegate(ctx, call.args as DelegateArgs)
    case 'reply':
      return reply(ctx, call.args as ReplyArgs)
    case 'remember':
      return remember(ctx, call.args as RememberArgs)
    case 'get_recent_history':
      return getRecentHistory(ctx, call.args as GetRecentHistoryArgs)
    case 'get_history_by_time':
      return getHistoryByTime(ctx, call.args as GetHistoryByTimeArgs)
    case 'search_memory':
      return searchMemoryTool(ctx, call.args as SearchMemoryArgs)
    case 'ask_user':
      return askUser(ctx, call.args as AskUserArgs)
    case 'schedule':
      return schedule(ctx, call.args as ScheduleArgs)
    case 'list_tasks':
      return listTasks(ctx, call.args as ListTasksArgs)
    case 'cancel_task':
      return cancelTask(ctx, call.args as CancelTaskArgs)
    default:
      throw new Error('unknown tool')
  }
}
