import { computeRecencyWeight } from './time.js'

export type LookupDoc = {
  id: string
  ts: number
}

export type RankedLookupRow = {
  id: string
  score: number
  ts: number
}

export const rankLookupResults = <
  Doc extends LookupDoc,
  Row extends RankedLookupRow,
>(params: {
  docs: Doc[]
  rankedIds: Array<string | number>
  limit: number
  build: (input: { doc: Doc; baseScore: number; recency: number }) => Row
}): Array<Omit<Row, 'ts'>> => {
  if (params.docs.length === 0 || params.rankedIds.length === 0) return []
  if (params.limit <= 0) return []

  const docsById = new Map(params.docs.map((doc) => [doc.id, doc]))
  const newest = Math.max(...params.docs.map((doc) => doc.ts))
  const oldest = Math.min(...params.docs.map((doc) => doc.ts))
  const scoreBase = Math.max(1, params.rankedIds.length)

  return params.rankedIds
    .map((id, index) => {
      const doc = docsById.get(String(id))
      if (!doc) return undefined
      const baseScore = (scoreBase - index) / scoreBase
      const recency = computeRecencyWeight(doc.ts, oldest, newest)
      return params.build({ doc, baseScore, recency })
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      if (a.ts !== b.ts) return b.ts - a.ts
      return a.id.localeCompare(b.id)
    })
    .slice(0, params.limit)
    .map(({ ts: _ts, ...item }) => item)
}
