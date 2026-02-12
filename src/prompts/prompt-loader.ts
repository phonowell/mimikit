import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'

const PROMPTS_ROOT = fileURLToPath(new URL('../../prompts/', import.meta.url))

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

export const loadPromptFile = (role: string, name: string): Promise<string> =>
  readPromptByPath(join(PROMPTS_ROOT, role, `${name}.md`))

export const loadPromptTemplate = (relativePath: string): Promise<string> =>
  readPromptByPath(join(PROMPTS_ROOT, relativePath))

export const loadSystemPrompt = (role: string): Promise<string> =>
  loadPromptFile(role, 'system')

export const loadInjectionPrompt = (role: string): Promise<string> =>
  loadPromptFile(role, 'injection')
