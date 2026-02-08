import { join } from 'node:path'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'

export const loadPromptFile = async (
  workDir: string,
  role: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', 'agents', role, `${name}.md`)
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
    await logSafeError('loadPromptFile', error, { meta: { path } })
    throw error
  }
}

export const loadSystemPrompt = (
  workDir: string,
  role: string,
): Promise<string> => loadPromptFile(workDir, role, 'system')

export const loadInjectionPrompt = (
  workDir: string,
  role: string,
): Promise<string> => loadPromptFile(workDir, role, 'injection')
