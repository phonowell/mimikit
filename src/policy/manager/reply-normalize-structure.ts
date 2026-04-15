import { normalizeSentence } from './reply-normalize-terms.js'
import { joinUnique } from './reply-normalize-tools.js'

type StructuredReply = {
  progress?: string
  risk?: string
  next?: string
  decision?: string
  archive?: string
}

const PROGRESS_PREFIXES = ['当前进展', '阶段结论'] as const
const NEXT_PREFIXES = ['下一步', '正在处理'] as const
const RISK_PREFIXES = ['当前风险', '当前卡点', '停下原因'] as const
const DECISION_PREFIXES = ['需要你决定', '还需要你直接确认'] as const

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const STRUCTURED_LABELS = [
  ...PROGRESS_PREFIXES,
  ...NEXT_PREFIXES,
  ...RISK_PREFIXES,
  ...DECISION_PREFIXES,
]
const STRUCTURED_LABEL_SOURCE = STRUCTURED_LABELS.map(escapeRegExp).join('|')

export const STRUCTURED_LABEL_PATTERN = new RegExp(
  `^(?:${STRUCTURED_LABEL_SOURCE})[:：]`,
  'u',
)

const NATURAL_REPLY_LABEL_PATTERN = new RegExp(
  `^(?:${STRUCTURED_LABEL_SOURCE})[:：]`,
  'u',
)

const readPrefixedContent = (
  line: string,
  prefixes: readonly string[],
): string | undefined => {
  for (const prefix of prefixes) {
    const matched = line.match(
      new RegExp(`^${escapeRegExp(prefix)}[:：]\\s*(.*)$`, 'u'),
    )
    if (matched) return matched[1]?.trim() ?? ''
  }
  return undefined
}

const toStructuredContent = (
  line: string,
): {
  kind: keyof StructuredReply | 'other'
  content: string
} => {
  const trimmed = normalizeSentence(line)
  if (!trimmed) return { kind: 'other', content: '' }
  if (trimmed.startsWith('[任务归档]') || /^任务归档[:：]/.test(trimmed))
    return { kind: 'archive', content: trimmed }
  const progress = readPrefixedContent(trimmed, PROGRESS_PREFIXES)
  if (progress !== undefined) return { kind: 'progress', content: progress }
  const next = readPrefixedContent(trimmed, NEXT_PREFIXES)
  if (next !== undefined) return { kind: 'next', content: next }
  const risk = readPrefixedContent(trimmed, RISK_PREFIXES)
  if (risk !== undefined) return { kind: 'risk', content: risk || trimmed }
  const decision = readPrefixedContent(trimmed, DECISION_PREFIXES)
  if (decision !== undefined) return { kind: 'decision', content: decision }
  if (trimmed.startsWith('任务 ')) return { kind: 'progress', content: trimmed }
  return { kind: 'other', content: trimmed }
}

export const shapeStructuredReply = (value: string): string => {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''

  const progress: string[] = []
  const risk: string[] = []
  const next: string[] = []
  const decision: string[] = []
  const archive: string[] = []

  for (const line of lines) {
    const { kind, content } = toStructuredContent(line)
    if (!content) continue
    if (kind === 'progress') {
      progress.push(content)
      continue
    }
    if (kind === 'risk') {
      risk.push(content)
      continue
    }
    if (kind === 'next') {
      next.push(content)
      continue
    }
    if (kind === 'decision') {
      decision.push(content)
      continue
    }
    if (kind === 'archive') {
      archive.push(content)
      continue
    }
    if (progress.length === 0) progress.push(content)
    else next.push(content)
  }

  const structured: string[] = []
  const progressLine =
    joinUnique(progress) || '我会继续按当前工作线推进并同步阶段结论。'
  structured.push(`当前进展：${progressLine}`)

  const riskLine = joinUnique(risk)
  if (riskLine) structured.push(`当前风险：${riskLine}`)

  const decisionLine = joinUnique(decision)
  if (decisionLine) structured.push(`需要你决定：${decisionLine}`)

  const nextLine =
    joinUnique(next) ||
    (decisionLine
      ? '我先停在这里，等你补充最小必要决定后再继续。'
      : riskLine
        ? '我会先按现有证据停在这里，待风险消除后继续推进。'
        : '我会继续沿当前工作线推进，只有遇到高风险或目标冲突时才抬给你。')
  structured.push(`下一步：${nextLine}`)

  const archiveLine = joinUnique(archive)
  if (archiveLine) structured.push(archiveLine)

  return structured.join('\n')
}

export const naturalizeReply = (value: string): string =>
  value
    .split('\n')
    .map((line) =>
      normalizeSentence(line).replace(NATURAL_REPLY_LABEL_PATTERN, '').trim(),
    )
    .filter(Boolean)
    .join('\n')
