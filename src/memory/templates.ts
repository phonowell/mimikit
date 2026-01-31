import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const loadTemplate = async (
  workDir: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'docs', 'prompts', name)
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}
