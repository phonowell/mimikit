import { shortId } from '../ids.js'
import { appendHistory } from '../storage/history.js'
import { nowIso } from '../time.js'

import type { ToolContext } from './context.js'
import type { HistoryMessage } from '../types/history.js'

export type ReplyArgs = { text: string }

export const reply = async (ctx: ToolContext, args: ReplyArgs) => {
  const message: HistoryMessage = {
    id: shortId(),
    role: 'assistant',
    text: args.text,
    createdAt: nowIso(),
  }
  await appendHistory(ctx.paths.history, message)
}
