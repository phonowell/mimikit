import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'

const PROMPTS_ROOT = fileURLToPath(new URL('../../prompts/', import.meta.url))

const readPromptByPath = async (
  path: string,
  allowMissing = true,
): Promise<string> => {
  try {
    const content = await read(path, { raw: true, echo: false })
    if (!content) return ''
    if (Buffer.isBuffer(content)) return content.toString('utf8')
    return typeof content === 'string' ? content : ''
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

const expandPromptIncludesByPath = async (
  path: string,
  includeStack: string[],
): Promise<string> => {
  if (includeStack.includes(path)) {
    throw new Error(
      `prompt_include_cycle:${[...includeStack, path]
        .map((current) => relative(PROMPTS_ROOT, current))
        .join(' -> ')}`,
    )
  }
  const content = await readPromptByPath(path, includeStack.length === 0)
  if (!content) return ''
  const nextStack = [...includeStack, path]
  let output = ''
  let cursor = 0
  const includeRe = /\{#include\s+([^}\s]+)\s*\}/g
  let match = includeRe.exec(content)
  while (match) {
    output += content.slice(cursor, match.index)
    const includeRef = match.at(1)
    if (!includeRef) throw new Error('prompt_include_path_empty')
    const includePath = normalizeIncludePath(path, includeRef)
    const included = await expandPromptIncludesByPath(includePath, nextStack)
    output += included
    cursor = match.index + match[0].length
    match = includeRe.exec(content)
  }
  output += content.slice(cursor)
  return output
}

export const loadPromptFile = (role: string, name: string): Promise<string> =>
  expandPromptIncludesByPath(join(PROMPTS_ROOT, role, `${name}.md`), [])

export const loadPromptTemplate = (relativePath: string): Promise<string> =>
  expandPromptIncludesByPath(join(PROMPTS_ROOT, relativePath), [])

export const loadSystemPrompt = (role: string): Promise<string> =>
  loadPromptFile(role, 'system')
