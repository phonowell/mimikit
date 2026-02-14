import type { FocusState } from '../orchestrator/core/runtime-state.js'

const FOCUS_RE = /<MIMIKIT:focus\s*>([\s\S]*?)<\/MIMIKIT:focus>/

const extractField = (text: string, key: string): string | undefined => {
  const re = new RegExp(`^\\s*${key}\\s*[:：]\\s*(.+)$`, 'm')
  const match = text.match(re)
  return match?.[1]?.trim() ?? undefined
}

export const extractFocusState = (output: string): FocusState | undefined => {
  const match = output.match(FOCUS_RE)
  if (!match?.[1]) return undefined
  const block = match[1]
  const intent = extractField(block, 'intent')
  const topic = extractField(block, 'topic')
  const taskIdsRaw = extractField(block, 'active_tasks')
  const activeTaskIds = taskIdsRaw
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (!intent && !topic && (!activeTaskIds || activeTaskIds.length === 0))
    return undefined
  return {
    ...(intent ? { intent } : {}),
    ...(topic ? { topic } : {}),
    ...(activeTaskIds && activeTaskIds.length > 0 ? { activeTaskIds } : {}),
  }
}

export const stripFocusBlock = (output: string): string =>
  output.replace(FOCUS_RE, '').trim()
