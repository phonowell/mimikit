import { appendFile, writeFile } from 'node:fs/promises'

import type { ProtocolPaths } from './protocol-paths.js'

export const appendTaskLog = async (
  paths: ProtocolPaths,
  entry: string,
): Promise<void> => {
  const line = `- ${new Date().toISOString()} ${entry}\n`
  try {
    await appendFile(paths.tasksLogPath, line)
  } catch {
    await writeFile(paths.tasksLogPath, `# Tasks Log\n\n${line}`)
  }
}
