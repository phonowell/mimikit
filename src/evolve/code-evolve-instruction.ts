import type { EvolveCodeInstruction } from './code-evolve-types.js'

export const buildCodeEvolvePrompt = (feedbackMessages: string[]): string => {
  const cases = feedbackMessages
    .slice(0, 20)
    .map((item, index) => `${index + 1}. ${item}`)
  return [
    'You are the system code-evolution planner.',
    'Goal: choose the highest-ROI issue from feedback and propose minimal code changes.',
    'Constraints: modify only directly relevant code; avoid architecture rewrites; keep rollback-safe.',
    'Do not target prompt files under prompts/*; focus on code files.',
    'Output strict JSON only in one of these forms:',
    '{"mode":"code","target":"<file or module>","prompt":"<short execution instruction>"}',
    '{"mode":"skip"}',
    'Feedback list:',
    ...cases,
  ].join('\n')
}

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
