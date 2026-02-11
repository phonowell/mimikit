import { joinPromptSections } from '../prompts/format.js'
import { loadInjectionPrompt, loadSystemPrompt } from '../prompts/prompt-loader.js'

type EvolverTemplateTag =
  | 'feedback_source'
  | 'persona_update'
  | 'no_recent_user_input'
  | 'persona_snapshot'

export type EvolverTemplates = {
  feedbackSource: string[]
  personaLines: string[]
  noRecentUserInput: string[]
  personaSnapshot: string
}

const parseMarkdownList = (content: string): string[] =>
  content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

const extractRequiredTemplateBlock = (
  content: string,
  tag: EvolverTemplateTag,
): string => {
  const pattern = new RegExp(`<MIMIKIT:${tag}\\s*>([\\s\\S]*?)<\\/MIMIKIT:${tag}>`)
  const match = content.match(pattern)
  const block = match?.[1]?.trim()
  if (!block) throw new Error(`missing_evolver_template_tag:${tag}`)
  return block
}

export const loadEvolverTemplates = async (
  workDir: string,
): Promise<EvolverTemplates> => {
  const system = (await loadSystemPrompt(workDir, 'evolver')).trim()
  if (!system) throw new Error('missing_evolver_template:evolver/system.md')
  const injection = (await loadInjectionPrompt(workDir, 'evolver')).trim()
  if (!injection)
    throw new Error('missing_evolver_template:evolver/injection.md')
  const content = joinPromptSections([system, injection])
  return {
    feedbackSource: parseMarkdownList(
      extractRequiredTemplateBlock(content, 'feedback_source'),
    ),
    personaLines: parseMarkdownList(
      extractRequiredTemplateBlock(content, 'persona_update'),
    ),
    noRecentUserInput: parseMarkdownList(
      extractRequiredTemplateBlock(content, 'no_recent_user_input'),
    ),
    personaSnapshot: extractRequiredTemplateBlock(content, 'persona_snapshot'),
  }
}
