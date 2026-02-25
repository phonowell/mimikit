import { renderPromptTemplate } from '../prompts/format.js'

import type { TokenUsage } from '../types/index.js'

export const DONE_MARKER = '<M:task_done/>'
export const MAX_RUN_ROUNDS = 3

export const hasDoneMarker = (output: string): boolean =>
  output.includes(DONE_MARKER)

export const stripDoneMarker = (output: string): string =>
  output.replaceAll(DONE_MARKER, '').trim()

export const mergeUsage = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  if (!next) return current
  const input =
    next.input !== undefined
      ? (current?.input ?? 0) + next.input
      : current?.input
  const output =
    next.output !== undefined
      ? (current?.output ?? 0) + next.output
      : current?.output
  const total =
    next.total !== undefined
      ? (current?.total ?? 0) + next.total
      : current?.total
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export const buildContinuePrompt = (
  template: string,
  latestOutput: string,
  nextRound: number,
): string =>
  renderPromptTemplate(template, {
    done_marker: DONE_MARKER,
    latest_output: latestOutput.trim(),
    next_round: String(nextRound),
    max_rounds: String(MAX_RUN_ROUNDS),
  })
