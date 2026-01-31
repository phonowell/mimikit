import { readHistory } from '../storage/history.js'

import type { ToolContext } from './context.js'

export type GetHistoryByTimeArgs = { after: string; before?: string }

export const getHistoryByTime = async (
  ctx: ToolContext,
  args: GetHistoryByTimeArgs,
) => {
  const history = await readHistory(ctx.paths.history)
  const afterTs = Date.parse(args.after)
  const beforeTs = args.before ? Date.parse(args.before) : Infinity
  const messages = history.filter((msg) => {
    const ts = Date.parse(msg.createdAt)
    return ts >= afterTs && ts <= beforeTs
  })
  return { messages }
}
