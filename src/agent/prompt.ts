import type { MemoryHit } from '../memory/search.js'

export type PromptContext = {
  sessionKey: string
  userMessage: string
  memoryHits: MemoryHit[]
  outputPolicy: string
}

export const buildPrompt = (context: PromptContext): string => {
  const lines: string[] = []
  lines.push(`Session: ${context.sessionKey}`)

  if (context.memoryHits.length > 0) {
    lines.push('', 'Memory Context:')
    for (const hit of context.memoryHits)
      lines.push(`${hit.path}:${hit.line} ${hit.text}`)
  }

  if (context.outputPolicy.trim().length > 0)
    lines.push('', context.outputPolicy.trim())

  lines.push('', 'User Message:', context.userMessage.trim())
  return lines.join('\n')
}
