import { buildCodeEvolveTaskPrompt } from '../prompts/build-prompts.js'

import type { EvolveCodeInstruction } from './code-evolve-types.js'

export const buildCodeEvolvePrompt = (params: {
  workDir: string
  feedbackMessages: string[]
}): Promise<string> =>
  buildCodeEvolveTaskPrompt({
    workDir: params.workDir,
    feedbackMessages: params.feedbackMessages,
  })

export const parseInstruction = (output: string): EvolveCodeInstruction => {
  const trimmed = output.trim()
  if (!trimmed) return { mode: 'skip' }
  const parseOne = (raw: string): EvolveCodeInstruction | null => {
    try {
      const parsed = JSON.parse(raw) as Partial<EvolveCodeInstruction>
      if (parsed.mode === 'code') {
        const target = parsed.target?.trim()
        const prompt = parsed.prompt?.trim()
        if (!target || !prompt) return { mode: 'skip' }
        return { mode: 'code', target, prompt }
      }
      return { mode: 'skip' }
    } catch {
      return null
    }
  }
  const direct = parseOne(trimmed)
  if (direct) return direct
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch?.[1]) {
    const fenced = parseOne(fenceMatch[1].trim())
    if (fenced) return fenced
  }
  return { mode: 'skip' }
}

export const isPromptTarget = (target: string): boolean => {
  const normalized = target.replaceAll('\\', '/').toLowerCase()
  return normalized.startsWith('prompts/') || normalized.includes('/prompts/')
}
