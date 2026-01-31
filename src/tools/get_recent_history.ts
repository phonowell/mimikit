import { readHistory } from '../storage/history.js'

import type { ToolContext } from './context.js'

export type GetRecentHistoryArgs = { count: number; offset?: number }

export const getRecentHistory = async (
  ctx: ToolContext,
  args: GetRecentHistoryArgs,
) => {
  const history = await readHistory(ctx.paths.history)
  const offset = args.offset ?? 0
  const start = Math.max(0, history.length - offset - args.count)
  const end = Math.max(0, history.length - offset)
  return { messages: history.slice(start, end) }
}
