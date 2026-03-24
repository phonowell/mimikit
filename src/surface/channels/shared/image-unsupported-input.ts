import { renderPromptTemplate } from '../../../foundation/prompting/format.js'
import { loadPromptTemplate } from '../../../foundation/prompting/prompt-loader.js'

const templateCache = new Map<string, string>()

const trimString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const loadTemplate = async (promptPath: string): Promise<string> => {
  const cached = templateCache.get(promptPath)
  if (cached !== undefined) return cached

  const template = (await loadPromptTemplate(promptPath)).trim()
  if (!template) throw new Error(`missing_prompt_template:${promptPath}`)
  templateCache.set(promptPath, template)
  return template
}

export const buildUnsupportedImageInputText = async (params: {
  promptPath: string
  fieldName: string
  fieldValue: unknown
}): Promise<string> =>
  renderPromptTemplate(await loadTemplate(params.promptPath), {
    [params.fieldName]: trimString(params.fieldValue),
  }).trim()
