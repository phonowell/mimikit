import { normalizeSentence } from './reply-normalize-terms.js'
import {
  dedupeConsecutiveLines,
  dedupeConsecutiveParagraphs,
} from './reply-normalize-tools.js'

const NATURAL_REPLY_LABEL_PATTERN =
  /^(?:当前进展|阶段结论|下一步|正在处理|当前风险|停下原因|需要你决定)[:：]\s*/u

export const normalizeManagerReplyText = (value: string): string => {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  return dedupeConsecutiveParagraphs(
    dedupeConsecutiveLines(
      normalized
        .split('\n')
        .map((line) =>
          normalizeSentence(line)
            .replace(NATURAL_REPLY_LABEL_PATTERN, '')
            .trim(),
        )
        .filter(Boolean)
        .join('\n'),
    ),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
