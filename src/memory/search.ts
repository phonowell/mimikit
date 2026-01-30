import { searchBm25 } from './bm25.js'
import { expandKeywords } from './query-expand.js'
import { resolveSearchFiles } from './search-files.js'
import { firstLine, parseHits, runRg, trimHits } from './search-utils.js'

import type { MemoryConfig, MemoryHit } from './types.js'

export const searchMemory = async (
  config: MemoryConfig,
  keywords: string[],
): Promise<MemoryHit[]> => {
  if (keywords.length === 0) return []

  const maxHits = config.maxHits ?? 10
  const maxChars = config.maxChars ?? 1200
  const expanded = expandKeywords(keywords, { maxTerms: 12 })
  if (expanded.length === 0) return []
  const paths = await resolveSearchFiles(config)

  if (paths.length === 0) return []

  const query = expanded.join(' ')

  if (!config.memoryPaths || config.memoryPaths.length === 0) {
    try {
      const bm25Hits = await searchBm25({
        workDir: config.workDir,
        query,
        limit: maxHits * 4,
      })
      if (bm25Hits.length > 0) {
        const mapped = bm25Hits.map((hit) => ({
          path: hit.path,
          line: hit.lineStart,
          text: firstLine(hit.text),
        }))
        return trimHits(mapped, maxHits, maxChars)
      }
    } catch {
      // fall back to rg
    }
  }

  const args = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '--max-count',
    String(maxHits),
    ...expanded.flatMap((kw) => ['-e', kw]),
    '--',
    ...paths,
  ]

  try {
    const lines = await runRg(args, config.workDir)
    return trimHits(parseHits(lines), maxHits, maxChars)
  } catch {
    return []
  }
}
