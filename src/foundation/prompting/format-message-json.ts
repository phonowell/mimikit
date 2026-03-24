import {
  escapeCdata,
  parseIsoToMs,
  stringifyPromptJson,
} from './format-base.js'

type PromptMessageBase = {
  id: string
  time: string
}

export const sortByTimeAndIdDesc = <T extends PromptMessageBase>(
  entries: T[],
): T[] =>
  [...entries].sort((a, b) => {
    const aTs = parseIsoToMs(a.time)
    const bTs = parseIsoToMs(b.time)
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

export const formatMessagesJson = <T extends PromptMessageBase>(
  entries: T[],
): string => {
  if (entries.length === 0) return ''
  return escapeCdata(
    stringifyPromptJson({
      messages: sortByTimeAndIdDesc(entries),
    }),
  )
}
