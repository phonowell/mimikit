import {
  shapeStructuredReply,
  STRUCTURED_LABEL_PATTERN,
} from './reply-normalize-structure.js'
import { normalizeSentence } from './reply-normalize-terms.js'
import {
  dedupeConsecutiveLines,
  dedupeConsecutiveParagraphs,
} from './reply-normalize-tools.js'

export const normalizeManagerReplyText = (value: string): string => {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const compacted = dedupeConsecutiveParagraphs(
    dedupeConsecutiveLines(
      shapeStructuredReply(
        normalized
          .split('\n')
          .map((line) => normalizeSentence(line))
          .filter(Boolean)
          .join('\n'),
      ),
    ),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const lines = compacted.split('\n').filter(Boolean)
  if (
    lines.some((line) => STRUCTURED_LABEL_PATTERN.test(line)) &&
    !lines.some((line) => line.startsWith('下一步：'))
  )
    return `${compacted}\n下一步：我会继续沿当前工作线推进。`
  return compacted
}
