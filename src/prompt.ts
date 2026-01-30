import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url))
const PROMPTS_DIR = resolve(SRC_DIR, '..', 'prompts')
const DOCS_DIR = resolve(SRC_DIR, '..', 'docs')
const PROMPT_CACHE = new Map<string, string>()
const DOC_CACHE = new Map<string, string>()

const loadPrompt = (relativePath: string): string => {
  const cached = PROMPT_CACHE.get(relativePath)
  if (cached) return cached
  const fullPath = join(PROMPTS_DIR, relativePath)
  try {
    const content = readFileSync(fullPath, 'utf-8')
    const normalized = content.replace(/\r\n/g, '\n').trimEnd()
    PROMPT_CACHE.set(relativePath, normalized)
    return normalized
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Missing prompt file: ${relativePath} (${fullPath}). ${message}`,
    )
  }
}

const renderPrompt = (
  template: string,
  vars: Record<string, string>,
): string => {
  let output = template
  for (const [key, value] of Object.entries(vars))
    output = output.replaceAll(`{{${key}}}`, value)

  return output
}

const loadDoc = (relativePath: string): string => {
  const cached = DOC_CACHE.get(relativePath)
  if (cached) return cached
  const fullPath = join(DOCS_DIR, relativePath)
  try {
    const content = readFileSync(fullPath, 'utf-8')
    const normalized = content.replace(/\r\n/g, '\n').trimEnd()
    DOC_CACHE.set(relativePath, normalized)
    return normalized
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Missing doc file: ${relativePath} (${fullPath}). ${message}`,
    )
  }
}

export const TASK_PROMPT = loadPrompt('task/core.md')
export const RUNTIME_AGENT_PROMPT = loadDoc('runtime/agent.md')
export const SELF_AWAKE_PROMPT = loadDoc('runtime/self-awake.md')
export const TASK_RUNTIME_PROMPT = loadDoc('runtime/task.md')

export const STATE_DIR_INSTRUCTION = (stateDir: string) => `
${renderPrompt(loadPrompt('agent/state-dir.md'), { STATE_DIR: stateDir })}
`

export const buildTaskPrompt = (taskPrompt: string): string => {
  const trimmed = taskPrompt.trim()
  const base = [TASK_RUNTIME_PROMPT, TASK_PROMPT].filter(Boolean).join('\n\n')
  if (!trimmed) return base
  return [base, 'Task:', trimmed].join('\n')
}
