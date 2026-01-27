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
  if (record.scoreCommand) lines.push(`- scoreCommand: ${record.scoreCommand}`)
  if (record.minScore !== undefined)
    lines.push(`- minScore: ${record.minScore}`)
  if (record.objective) lines.push(`- objective: ${record.objective}`)
  if (record.score !== undefined) lines.push(`- score: ${record.score}`)
  if (record.guardRequireClean !== undefined)
    lines.push(`- guardRequireClean: ${record.guardRequireClean}`)
  if (record.guardMaxChangedFiles !== undefined)
    lines.push(`- guardMaxChangedFiles: ${record.guardMaxChangedFiles}`)
  if (record.guardMaxChangedLines !== undefined)
    lines.push(`- guardMaxChangedLines: ${record.guardMaxChangedLines}`)
  if (record.changedFiles !== undefined)
    lines.push(`- changedFiles: ${record.changedFiles}`)
  if (record.changedLines !== undefined)
    lines.push(`- changedLines: ${record.changedLines}`)
  if (record.triggeredByTaskId)
    lines.push(`- triggeredByTaskId: ${record.triggeredByTaskId}`)
  if (record.codexSessionId)
    lines.push(`- codexSessionId: ${record.codexSessionId}`)

  if (record.prompt !== undefined) {
    lines.push('- prompt: |')
    lines.push(...indentBlock(record.prompt))
  }
  if (record.scoreSummary !== undefined) {
    lines.push('- scoreSummary: |')
    lines.push(...indentBlock(record.scoreSummary))
  }
  if (record.result !== undefined) {
    lines.push('- result: |')
    lines.push(...indentBlock(record.result))
  }
  return `${lines.join('\n')}\n\n`
}
