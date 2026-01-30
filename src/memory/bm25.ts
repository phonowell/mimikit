import { buildIndex, type Chunk } from './bm25-index.js'

export const searchBm25 = async (params: {
  workDir: string
  query: string
  limit: number
}): Promise<Array<Chunk & { score: number }>> => {
  const index = await buildIndex(params.workDir)
  if (!index) return []
  const results = index.engine.search(params.query, params.limit) as Array<
    { id: number; score: number } | number
  >
  const hits: Array<Chunk & { score: number }> = []
  for (const result of results) {
    if (typeof result === 'number') {
      const chunk = index.chunks.find((item) => item.id === result)
      if (!chunk) continue
      hits.push({ ...chunk, score: 1 })
      continue
    }
    const chunk = index.chunks.find((item) => item.id === result.id)
    if (!chunk) continue
    hits.push({ ...chunk, score: result.score })
  }
  return hits
}

export const getBm25Stats = async (
  workDir: string,
): Promise<{
  fileCount: number
  chunkCount: number
}> => {
  const index = await buildIndex(workDir)
  if (!index) return { fileCount: 0, chunkCount: 0 }
  return { fileCount: index.fileCount, chunkCount: index.chunks.length }
}
