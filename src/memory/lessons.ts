import { appendFile } from '../utils/fs.js'

export type LessonEntry = {
  ts: string
  taskId: string
  sessionKey: string
  status: 'failed' | 'low-score'
  reason: string
  prompt: string
  output?: string
  objective?: string
  score?: number
  minScore?: number
}

const trimText = (value: string, limit: number): string =>
  value.length > limit ? value.slice(0, limit) : value

const indentBlock = (value: string): string[] => {
  if (value.length === 0) return ['  ']
  return value.split('\n').map((line) => `  ${line}`)
}

const formatLesson = (entry: LessonEntry): string => {
  const lines: string[] = [`## ${entry.ts}`]
  lines.push(`- taskId: ${entry.taskId}`)
  lines.push(`- sessionKey: ${entry.sessionKey}`)
  lines.push(`- status: ${entry.status}`)
  lines.push(`- reason: ${entry.reason}`)
  if (entry.objective) lines.push(`- objective: ${entry.objective}`)
  if (entry.score !== undefined) lines.push(`- score: ${entry.score}`)
  if (entry.minScore !== undefined) lines.push(`- minScore: ${entry.minScore}`)
  lines.push('- prompt: |')
  lines.push(...indentBlock(trimText(entry.prompt, 1200)))
  if (entry.output !== undefined) {
    lines.push('- output: |')
    lines.push(...indentBlock(trimText(entry.output, 1200)))
  }
  return `${lines.join('\n')}\n\n`
}

export const appendLesson = async (
  lessonsPath: string,
  entry: LessonEntry,
): Promise<void> => {
  await appendFile(lessonsPath, formatLesson(entry))
}
