import { normalizeSentence } from './reply-normalize-terms.js'
import { joinUnique } from './reply-normalize-tools.js'

type StructuredReply = {
  progress?: string
  risk?: string
  next?: string
  decision?: string
  archive?: string
}

export const STRUCTURED_LABEL_PATTERN =
  /^(当前进展|下一步|当前风险|需要你决定)：/

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
  if (trimmed.startsWith('当前进展：')) {
    return {
      kind: 'progress',
      content: trimmed.replace(/^当前进展：/, '').trim(),
    }
  }
  if (trimmed.startsWith('阶段结论：')) {
    return {
      kind: 'progress',
      content: trimmed.replace(/^阶段结论：/, '').trim(),
    }
  }
  if (trimmed.startsWith('下一步：'))
    return { kind: 'next', content: trimmed.replace(/^下一步：/, '').trim() }
  if (trimmed.startsWith('正在处理：'))
    return { kind: 'next', content: trimmed.replace(/^正在处理：/, '').trim() }
  if (trimmed.startsWith('当前风险：'))
    return { kind: 'risk', content: trimmed.replace(/^当前风险：/, '').trim() }
  if (trimmed.startsWith('停下原因：'))
    return { kind: 'risk', content: trimmed }
  if (trimmed.startsWith('需要你决定：')) {
    return {
      kind: 'decision',
      content: trimmed.replace(/^需要你决定：/, '').trim(),
    }
  }
  if (trimmed.startsWith('任务 ')) return { kind: 'progress', content: trimmed }
  if (
    /(继续推进|继续沿当前工作线推进|继续按当前目标推进|我会继续)/.test(trimmed)
  )
    return { kind: 'next', content: trimmed }
  if (
    /(请直接说明|请明确|请补充|请先|需要你|请你|是否|继续哪一条工作线)/.test(
      trimmed,
    )
  )
    return { kind: 'decision', content: trimmed }
  if (
    /(风险|阻塞|失败|未通过|无法|不能|还缺|不足|命中门禁|需要补充输入|直接授权和边界信息)/.test(
      trimmed,
    )
  )
    return { kind: 'risk', content: trimmed }
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
