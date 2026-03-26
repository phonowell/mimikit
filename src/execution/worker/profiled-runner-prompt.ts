import {
  hasStructuredTaskHandoff,
  stripTaskHandoffTag,
} from './task-handoff-protocol.js'

export const SKILL_USAGE_DONE_TAG_PATTERN =
  // prompt-guard-exempt: protocol done-tag contract constant, not an LLM prompt template.
  '<M:skill_usage status="done">{skill-a,skill-b}</M:skill_usage>'

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
