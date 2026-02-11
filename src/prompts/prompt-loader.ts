import { join } from 'node:path'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'

const readPromptByPath = async (path: string): Promise<string> => {
  try {
    const content = await read(path, { raw: true })
    if (!content) return ''
    if (Buffer.isBuffer(content)) return content.toString('utf8')
    return typeof content === 'string' ? content : ''
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return ''
    await logSafeError('readPromptByPath', error, { meta: { path } })
    throw error
  }
}

export const loadPromptFile = (
  workDir: string,
  role: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', role, `${name}.md`)
  return readPromptByPath(path)
}

export const loadPromptTemplate = (
  workDir: string,
  relativePath: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', relativePath)
  return readPromptByPath(path)
}

export const loadSystemPrompt = (
  workDir: string,
  role: string,
): Promise<string> => loadPromptFile(workDir, role, 'system')

export const loadInjectionPrompt = (
  workDir: string,
  role: string,
): Promise<string> => loadPromptFile(workDir, role, 'injection')
