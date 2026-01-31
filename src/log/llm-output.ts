import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureDir } from '../fs/ensure.js'
import { shortId } from '../ids.js'

export const writeLlmOutput = async (params: {
  dir: string
  role: string
  output: string
  taskId?: string
}): Promise<string> => {
  await ensureDir(params.dir)
  const safeRole = params.role.replace(/[^a-z0-9_-]/gi, '_')
  const parts = [safeRole]
  if (params.taskId) parts.push(params.taskId)
  parts.push(shortId())
  const filename = `${parts.join('-')}.txt`
  const path = join(params.dir, filename)
  await writeFile(path, params.output, 'utf8')
  return path
}
