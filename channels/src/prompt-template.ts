import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Environment, FileSystemLoader, Template } from 'nunjucks'

const PROMPTS_ROOT = fileURLToPath(new URL('../prompts/', import.meta.url))

const TEMPLATE_ENV = new Environment(
  new FileSystemLoader(PROMPTS_ROOT, { noCache: true }),
  {
    autoescape: false,
    noCache: true,
    throwOnUndefined: false,
  },
)

const resolvePromptPath = (relativePath: string): string => {
  const normalized = relativePath.trim().replace(/^\/+/, '')
  if (!normalized) throw new Error('prompt_path_empty')
  return resolve(PROMPTS_ROOT, normalized)
}

export const loadPromptTemplate = async (relativePath: string): Promise<string> =>
  (await readFile(resolvePromptPath(relativePath), 'utf8')).trim()

export const renderPromptTemplate = (
  template: string,
  values: Record<string, string>,
): string => new Template(template, TEMPLATE_ENV).render(values)
