import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureDir } from './rollup-files.js'
import { formatTimestamp } from './write.js'

export const writeDailySummary = async (params: {
  workDir: string
  day: string
  summary: string
  sources: string[]
}): Promise<string> => {
  const dir = join(params.workDir, 'memory', 'summary')
  await ensureDir(dir)
  const path = join(dir, `${params.day}.md`)
  const header = [
    `# Summary: ${params.day}`,
    `- generated: ${formatTimestamp(new Date())}`,
    `- sources: ${params.sources.map((src) => src.replace(`${params.workDir}/`, '')).join(', ')}`,
    '',
  ].join('\n')
  await writeFile(path, `${header}${params.summary}\n`)
  return path
}

export const writeMonthlySummary = async (params: {
  workDir: string
  month: string
  summary: string
  sources: string[]
}): Promise<string> => {
  const dir = join(params.workDir, 'memory', 'summary')
  await ensureDir(dir)
  const path = join(dir, `${params.month}.md`)
  const header = [
    `# Summary: ${params.month}`,
    `- generated: ${formatTimestamp(new Date())}`,
    `- sources: ${params.sources.map((src) => src.replace(`${params.workDir}/`, '')).join(', ')}`,
    '',
  ].join('\n')
  await writeFile(path, `${header}${params.summary}\n`)
  return path
}
