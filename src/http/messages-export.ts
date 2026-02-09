import type { ChatMessage } from '../orchestrator/read-model/chat-view.js'
import type { Role, TokenUsage } from '../types/index.js'

const TITLE = 'Mimikit 对话导出'
const EMPTY_MESSAGE_TEXT = '（空消息）'
const EMPTY_EXPORT_TEXT = '暂无消息'

const COUNT_SUFFIXES = ['', 'k', 'M', 'B', 'T']
const integerFormatter = new Intl.NumberFormat('en-US')
const compactFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

const pad2 = (value: number): string => String(value).padStart(2, '0')

const parseIso = (iso: string): Date | null => {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const formatDateTime = (iso: string): string => {
  const date = parseIso(iso)
  if (!date) return iso
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds(),
  )}`
}

const formatTime = (iso: string): string => {
  const date = parseIso(iso)
  if (!date) return iso
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds(),
  )}`
}

const formatRoleLabel = (role: Role): string => {
  if (role === 'user') return 'USER'
  if (role === 'assistant') return 'AGENT'
  return 'SYSTEM'
}

const compactInlineText = (text: string, maxChars = 90): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (!oneLine) return EMPTY_MESSAGE_TEXT
  if (oneLine.length <= maxChars) return oneLine
  return `${oneLine.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

const formatCount = (value: number): string => {
  const rounded = Math.round(value)
  let scaled = rounded
  let suffixIndex = 0

  while (Math.abs(scaled) >= 1000 && suffixIndex < COUNT_SUFFIXES.length - 1) {
    scaled /= 1000
    suffixIndex += 1
  }

  if (suffixIndex === 0) return integerFormatter.format(rounded)

  let normalized = Math.round(scaled * 10) / 10
  if (Math.abs(normalized) >= 1000 && suffixIndex < COUNT_SUFFIXES.length - 1) {
    normalized /= 1000
    suffixIndex += 1
  }

  return `${compactFormatter.format(normalized)}${COUNT_SUFFIXES[suffixIndex]}`
}

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  return value
}

const formatUsage = (usage?: TokenUsage): string => {
  if (!usage) return ''
  const input = asFiniteNumber(usage.input)
  const output = asFiniteNumber(usage.output)
  const total = asFiniteNumber(usage.total)
  const parts: string[] = []
  if (input !== null) parts.push(`↑ ${formatCount(input)}`)
  if (output !== null) parts.push(`↓ ${formatCount(output)}`)
  if (total !== null && input === null && output === null)
    parts.push(`Σ ${formatCount(total)}`)
  if (parts.length === 0) return ''
  return `Tokens: ${parts.join(' ')}`
}

const formatElapsed = (elapsedMs?: number): string => {
  const ms = asFiniteNumber(elapsedMs)
  if (ms === null) return ''
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `用时 ${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const seconds = totalSeconds % 60
  if (totalHours > 0) return `用时 ${totalHours}h ${minutes}m ${seconds}s`
  return `用时 ${totalMinutes}m ${seconds}s`
}

const formatBody = (text: string): string => {
  const value = text.trimEnd()
  if (!value.trim()) return EMPTY_MESSAGE_TEXT
  return value
}

const buildQuoteLine = (
  message: ChatMessage,
  messageLookup: Map<string, ChatMessage>,
): string | null => {
  const quoteId = typeof message.quote === 'string' ? message.quote.trim() : ''
  if (!quoteId) return null
  const quoted = messageLookup.get(quoteId)
  if (!quoted) return `> 引用消息：${quoteId}`
  const quoteRole = formatRoleLabel(quoted.role)
  const quoteTime = formatTime(quoted.createdAt)
  const quoteText = compactInlineText(quoted.text)
  return `> 引用 ${quoteRole}（${quoteTime}）：${quoteText}`
}

const buildMetaLine = (message: ChatMessage): string => {
  const parts: string[] = []
  const usage = formatUsage(message.usage)
  if (usage) parts.push(usage)
  const elapsed = formatElapsed(message.elapsedMs)
  if (elapsed) parts.push(elapsed)
  return parts.join(' · ')
}

const formatFilenameStamp = (iso: string): string => {
  const date = parseIso(iso)
  const safeDate = date ?? new Date()
  return `${safeDate.getUTCFullYear()}${pad2(safeDate.getUTCMonth() + 1)}${pad2(
    safeDate.getUTCDate(),
  )}-${pad2(safeDate.getUTCHours())}${pad2(safeDate.getUTCMinutes())}${pad2(
    safeDate.getUTCSeconds(),
  )}`
}

export const buildMessagesExportFilename = (exportedAt: string): string =>
  `mimikit-chat-${formatFilenameStamp(exportedAt)}.md`

export const buildMessagesMarkdownExport = (params: {
  messages: ChatMessage[]
  exportedAt: string
  limit: number
}): string => {
  const { messages, exportedAt, limit } = params
  const lines = [
    `# ${TITLE}`,
    '',
    `导出时间：${formatDateTime(exportedAt)}`,
    `消息数：${messages.length}`,
  ]
  if (messages.length >= limit) lines.push(`导出上限：${limit}（可能已截断）`)
  lines.push('')

  if (messages.length === 0) {
    lines.push('', '---', '', EMPTY_EXPORT_TEXT, '')
    return `${lines.join('\n')}\n`
  }

  const messageLookup = new Map<string, ChatMessage>()
  for (const message of messages) {
    const messageId = message.id.trim()
    if (!messageId) continue
    messageLookup.set(messageId, message)
  }

  for (const message of messages) {
    lines.push(
      '---',
      '',
      `### [${formatTime(message.createdAt)}] ${formatRoleLabel(message.role)}`,
      '',
    )

    const quoteLine = buildQuoteLine(message, messageLookup)
    if (quoteLine) lines.push(quoteLine, '')

    lines.push(formatBody(message.text), '')

    const metaLine = buildMetaLine(message)
    if (metaLine) lines.push(`_${metaLine}_`, '')
  }

  return `${lines.join('\n')}\n`
}
