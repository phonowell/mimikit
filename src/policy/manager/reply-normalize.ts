import {
  naturalizeReply,
  shapeStructuredReply,
  STRUCTURED_LABEL_PATTERN,
} from './reply-normalize-structure.js'
import { normalizeSentence } from './reply-normalize-terms.js'
import {
  dedupeConsecutiveLines,
  dedupeConsecutiveParagraphs,
} from './reply-normalize-tools.js'

type ReplyNormalizationMode = 'natural' | 'structured'

export const normalizeManagerReplyText = (
  value: string,
  options: {
    mode?: ReplyNormalizationMode
  } = {},
): string => {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const mode = options.mode ?? 'natural'
  const normalizedLines = normalized
    .split('\n')
    .map((line) => normalizeSentence(line))
    .filter(Boolean)
    .join('\n')
  const compacted = dedupeConsecutiveParagraphs(
    dedupeConsecutiveLines(
      mode === 'structured'
        ? shapeStructuredReply(normalizedLines)
        : naturalizeReply(normalizedLines),
    ),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (mode !== 'structured') return compacted
  const lines = compacted.split('\n').filter(Boolean)
  if (
    lines.some((line) => STRUCTURED_LABEL_PATTERN.test(line)) &&
    !lines.some((line) => line.startsWith('下一步：'))
  )
    return `${compacted}\n下一步：我会继续沿当前工作线推进。`
  return compacted
}
