import { type TaskRecord } from './types.js'

const indentBlock = (value: string): string[] => {
  if (value.length === 0) return ['  ']
  return value.split('\n').map((line) => `  ${line}`)
}

export const formatTaskRecord = (record: TaskRecord): string => {
  const lines: string[] = [`## Task ${record.id}`]
  lines.push(`- status: ${record.status}`)
  lines.push(`- sessionKey: ${record.sessionKey}`)
  lines.push(`- runId: ${record.runId}`)
  lines.push(`- retries: ${record.retries}`)
  if (record.attempt !== undefined) lines.push(`- attempt: ${record.attempt}`)
  lines.push(`- createdAt: ${record.createdAt}`)
  lines.push(`- updatedAt: ${record.updatedAt}`)
  lines.push(`- resume: ${record.resume}`)
  if (record.maxIterations !== undefined)
    lines.push(`- maxIterations: ${record.maxIterations}`)
  if (record.verifyCommand)
    lines.push(`- verifyCommand: ${record.verifyCommand}`)
  if (record.codexSessionId)
    lines.push(`- codexSessionId: ${record.codexSessionId}`)

  if (record.prompt !== undefined) {
    lines.push('- prompt: |')
    lines.push(...indentBlock(record.prompt))
  }
  if (record.result !== undefined) {
    lines.push('- result: |')
    lines.push(...indentBlock(record.result))
  }
  return `${lines.join('\n')}\n\n`
}
