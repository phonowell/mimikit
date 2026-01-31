import { searchMemory } from '../memory/search.js'

import type { ToolContext } from './context.js'

export type SearchMemoryArgs = {
  query: string
  after?: string
  before?: string
  limit?: number
}

const parseDateFromPath = (path: string): string | null => {
  const match = path.match(/(\d{4}-\d{2}-\d{2}|\d{4}-\d{2})/)
  return match ? (match[1] ?? null) : null
}

export const searchMemoryTool = async (
  ctx: ToolContext,
  args: SearchMemoryArgs,
) => {
  const hits = await searchMemory({
    stateDir: ctx.paths.root,
    query: args.query,
    limit: args.limit ?? 5,
    k1: 1.2,
    b: 0.75,
    minScore: 0.2,
  })
  const afterTs = args.after ? Date.parse(args.after) : -Infinity
  const beforeTs = args.before ? Date.parse(args.before) : Infinity
  const filtered = hits.filter((hit) => {
    const date = parseDateFromPath(hit.source)
    if (!date) return true
    const iso = date.length === 7 ? `${date}-01T00:00:00Z` : `${date}T00:00:00Z`
    const ts = Date.parse(iso)
    return ts >= afterTs && ts <= beforeTs
  })
  return { hits: filtered }
}
