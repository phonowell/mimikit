import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readTextFile } from '../fs/read-text.js'
import { logSafeError } from '../log/safe.js'

const PROMPTS_ROOT = fileURLToPath(new URL('../../prompts/', import.meta.url))

const readPromptByPath = async (
  path: string,
  allowMissing = true,
): Promise<string> => {
  try {
    return await readTextFile(path)
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') {
      if (allowMissing) return ''
      throw new Error(`prompt_include_not_found:${path}`)
    }
    await logSafeError('readPromptByPath', error, { meta: { path } })
    throw error
  }
}

const normalizeIncludePath = (
  currentPath: string,
  includePath: string,
): string => {
  const trimmed = includePath.trim()
  if (!trimmed) throw new Error('prompt_include_path_empty')
  const withExt = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
  if (isAbsolute(withExt))
    throw new Error(`prompt_include_absolute_path:${trimmed}`)
  const resolvedInclude = resolve(dirname(currentPath), withExt)
  const relativeInclude = relative(PROMPTS_ROOT, resolvedInclude)
  if (relativeInclude.startsWith('..') || isAbsolute(relativeInclude))
    throw new Error(`prompt_include_outside_root:${trimmed}`)
  return resolvedInclude
}

const resolvePromptPath = (relativePath: string): string =>
  normalizeIncludePath(join(PROMPTS_ROOT, '_.md'), relativePath)

export const loadPromptFile = (role: string, name: string): Promise<string> =>
  readPromptByPath(resolvePromptPath(`${role}/${name}.md`))

export const loadPromptTemplate = (relativePath: string): Promise<string> =>
  readPromptByPath(resolvePromptPath(relativePath))

export const loadPromptSource = async (
  relativePath: string,
): Promise<{ path: string; template: string }> => {
  const path = resolvePromptPath(relativePath)
  return { path, template: await readPromptByPath(path) }
}

export const loadSystemPrompt = (role: string): Promise<string> =>
  loadPromptFile(role, 'system')

export { PROMPTS_ROOT, resolvePromptPath }
