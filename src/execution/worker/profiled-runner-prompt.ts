import { renderPromptTemplate } from '../../foundation/prompting/format.js'

import {
  hasStructuredTaskHandoff,
  stripTaskHandoffTag,
  TASK_HANDOFF_TAG_PATTERN,
} from './task-handoff-protocol.js'

export const SKILL_USAGE_DONE_TAG_PATTERN =
  // prompt-guard-exempt: protocol done-tag contract constant, not an LLM prompt template.
  '<M:skill_usage status="done">{skill-a,skill-b}</M:skill_usage>'
export const MAX_RUN_ROUNDS = 3
export const MAX_CONTINUE_LATEST_OUTPUT_CHARS = 1_600

const SKILL_USAGE_DONE_TEST_RE =
  /<M:skill_usage\b[^>]*\bstatus\s*=\s*(?:(['"])done\1|done(?=[\s>]))[^>]*>[\s\S]*?<\/M:skill_usage>/i
const SKILL_USAGE_DONE_STRIP_RE =
  /<M:skill_usage\b[^>]*\bstatus\s*=\s*(?:(['"])done\1|done(?=[\s>]))[^>]*>[\s\S]*?<\/M:skill_usage>/gi

export const hasDoneMarker = (output: string): boolean =>
  SKILL_USAGE_DONE_TEST_RE.test(output)

export const stripDoneMarker = (output: string): string =>
  output.replace(SKILL_USAGE_DONE_STRIP_RE, '').trim()

export const hasWorkerCompletionMarker = (output: string): boolean =>
  hasDoneMarker(output) && hasStructuredTaskHandoff(output)

export const stripWorkerProtocolTags = (output: string): string =>
  stripDoneMarker(stripTaskHandoffTag(output))

const clipLatestOutput = (value: string): string => {
  const normalized = value.trim()
  if (normalized.length <= MAX_CONTINUE_LATEST_OUTPUT_CHARS) return normalized
  return `${normalized.slice(0, MAX_CONTINUE_LATEST_OUTPUT_CHARS - 3).trimEnd()}...`
}

export const buildContinuePrompt = (
  template: string,
  templatePath: string,
  latestOutput: string,
  nextRound: number,
  options?: {
    includeLatestOutput?: boolean
    maxRounds?: number
  },
): string =>
  renderPromptTemplate(
    template,
    {
      done_tag_pattern: SKILL_USAGE_DONE_TAG_PATTERN,
      task_handoff_tag_pattern: TASK_HANDOFF_TAG_PATTERN,
      latest_output:
        options?.includeLatestOutput === false
          ? ''
          : clipLatestOutput(latestOutput),
      next_round: String(nextRound),
      max_rounds: String(options?.maxRounds ?? MAX_RUN_ROUNDS),
    },
    templatePath,
  )
