import { readFile } from 'node:fs/promises'

import { runCodexSdk } from '../../src/llm/sdk-runner.js'

import type { Usage } from './types.js'

const llmValidationSchema = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    score: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['pass', 'score', 'reason'],
  additionalProperties: false,
} as const

export const loadReference = async (
  path: string,
  maxChars = 12000,
): Promise<string | undefined> => {
  try {
    const content = await readFile(path, 'utf8')
    if (content.length <= maxChars) return content
    return `${content.slice(0, maxChars)}\n...[truncated]`
  } catch {
    return undefined
  }
}

export const runLlmValidation = async (params: {
  workDir: string
  model?: string
  timeoutMs: number
  caseId: string
  criteria: string
  context?: string
  prompt: string
  response: string
}): Promise<{
  pass: boolean
  score: number
  reason: string
  elapsedMs?: number
  usage?: Usage
}> => {
  const validationPrompt = [
    'You are a strict test validator.',
    'Evaluate the assistant response against the criteria.',
    'Return JSON only with fields: pass (boolean), score (0-100), reason (short).',
    `Case: ${params.caseId}`,
    `Criteria: ${params.criteria}`,
    ...(params.context ? [`Reference:\n${params.context}`] : []),
    `User prompt: ${params.prompt}`,
    `Assistant response: ${params.response}`,
  ].join('\n')

  const llmResult = await runCodexSdk({
    role: 'teller',
    prompt: validationPrompt,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    outputSchema: llmValidationSchema,
    ...(params.model ? { model: params.model } : {}),
  })

  try {
    const parsed = JSON.parse(llmResult.output) as {
      pass: boolean
      score: number
      reason: string
    }
    return {
      pass: Boolean(parsed.pass),
      score: Number.isFinite(parsed.score) ? parsed.score : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'no reason',
      elapsedMs: llmResult.elapsedMs,
      usage: llmResult.usage,
    }
  } catch {
    return {
      pass: false,
      score: 0,
      reason: 'validator output was not valid JSON',
      elapsedMs: llmResult.elapsedMs,
      usage: llmResult.usage,
    }
  }
}
