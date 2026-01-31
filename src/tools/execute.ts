import { appendLog } from '../log/append.js'

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

const summarizeResult = (
  tool: ToolCall['tool'],
  result: unknown,
): Record<string, unknown> | null => {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  switch (tool) {
    case 'delegate':
    case 'schedule':
      if (record.taskId || record.triggerId)
        return { taskId: record.taskId, triggerId: record.triggerId }
      return null
    case 'ask_user':
      return record.questionId ? { questionId: record.questionId } : null
    case 'cancel_task':
      return Object.prototype.hasOwnProperty.call(record, 'success')
        ? { success: record.success }
        : null
    case 'list_tasks':
      return Array.isArray(record.tasks) ? { count: record.tasks.length } : null
    case 'get_recent_history':
    case 'get_history_by_time':
      return Array.isArray(record.messages)
        ? { count: record.messages.length }
        : null
    case 'search_memory':
      return Array.isArray(record.hits) ? { count: record.hits.length } : null
    default:
      return null
  }
}

export const executeTool = async (ctx: ToolContext, call: ToolCall) => {
  await appendLog(ctx.paths.log, {
    event: 'tool_call',
    role: ctx.role,
    tool: call.tool,
  })
  if (!canUseTool(call.tool, ctx.role)) {
    await appendLog(ctx.paths.log, {
      event: 'tool_error',
      role: ctx.role,
      tool: call.tool,
      error: 'tool not allowed',
    })
    throw new Error(`tool not allowed: ${String(call.tool)}`)
  }

  try {
    let result: unknown
    switch (call.tool) {
      case 'delegate':
        result = await delegate(ctx, call.args as DelegateArgs)
        break
      case 'reply':
        result = await reply(ctx, call.args as ReplyArgs)
        break
      case 'remember':
        result = await remember(ctx, call.args as RememberArgs)
        break
      case 'get_recent_history':
        result = await getRecentHistory(ctx, call.args as GetRecentHistoryArgs)
        break
      case 'get_history_by_time':
        result = await getHistoryByTime(ctx, call.args as GetHistoryByTimeArgs)
        break
      case 'search_memory':
        result = await searchMemoryTool(ctx, call.args as SearchMemoryArgs)
        break
      case 'ask_user':
        result = await askUser(ctx, call.args as AskUserArgs)
        break
      case 'schedule':
        result = await schedule(ctx, call.args as ScheduleArgs)
        break
      case 'list_tasks':
        result = await listTasks(ctx, call.args as ListTasksArgs)
        break
      case 'cancel_task':
        result = await cancelTask(ctx, call.args as CancelTaskArgs)
        break
      default:
        throw new Error('unknown tool')
    }
    const summary = summarizeResult(call.tool, result)
    await appendLog(ctx.paths.log, {
      event: 'tool_result',
      role: ctx.role,
      tool: call.tool,
      ok: true,
      ...(summary ? { summary } : {}),
    })
    return result
  } catch (error) {
    await appendLog(ctx.paths.log, {
      event: 'tool_error',
      role: ctx.role,
      tool: call.tool,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
