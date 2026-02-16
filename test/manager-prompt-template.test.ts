import { expect, test } from 'vitest'

import { renderPromptTemplate } from '../src/prompts/format.js'
import { loadSystemPrompt } from '../src/prompts/prompt-loader.js'

const baseTemplateValues = {
  environment: '- now_iso: 2026-02-16T00:00:00.000Z',
  inputs: '',
  results: '',
  history_lookup: '',
  tasks: '',
  persona: '',
  user_profile: '',
}

test('manager template renders persona and user_profile blocks independently', async () => {
  const template = await loadSystemPrompt('manager')
  const personaOnly = renderPromptTemplate(template, {
    ...baseTemplateValues,
    persona: 'name: mimikit',
  })
  expect(personaOnly).toContain('<M:persona>')
  expect(personaOnly).not.toContain('<M:user_profile>')

  const userProfileOnly = renderPromptTemplate(template, {
    ...baseTemplateValues,
    user_profile: 'tone: concise',
  })
  expect(userProfileOnly).not.toContain('<M:persona>')
  expect(userProfileOnly).toContain('<M:user_profile>')
})
