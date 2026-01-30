import type { MemoryHit } from './types.js'

export const formatMemoryHits = (hits: MemoryHit[]): string => {
  if (hits.length === 0) return ''
  const lines = ['## Mem']
  for (const hit of hits) lines.push(`- ${hit.path}:${hit.line} ${hit.text}`)
  return lines.join('\n')
}
