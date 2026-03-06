import { renderPromptTemplate } from '../../prompts/format.js'
import { loadPromptTemplate } from '../../prompts/prompt-loader.js'

const PROMPT_PATH = 'manager/telegram-image-unsupported-input.md'

let cachedTemplate: string | undefined

const trimString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const loadTemplate = async (): Promise<string> => {
  if (cachedTemplate !== undefined) return cachedTemplate
  const template = (await loadPromptTemplate(PROMPT_PATH)).trim()
  if (!template) throw new Error(`missing_prompt_template:${PROMPT_PATH}`)
  cachedTemplate = template
  return template
}

export const buildUnsupportedImageInputText = async (
  captionLike: unknown,
): Promise<string> =>
  renderPromptTemplate(await loadTemplate(), {
    caption: trimString(captionLike),
  }).trim()
