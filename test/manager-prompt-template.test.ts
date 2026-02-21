import { expect, test } from 'vitest'

import { renderPromptTemplate } from '../src/prompts/format.js'
import { loadSystemPrompt } from '../src/prompts/prompt-loader.js'

const baseTemplateValues = {
  environment:
    '- client_time_zone: Asia/Shanghai\n- client_now_iso: 2026-02-16T00:00:00.000+08:00',
  inputs: '',
  results: '',
  history_lookup: '',
  action_feedback: '',
  tasks: '',
  persona: '',
  user_profile: '',
}

test('manager template renders persona block when persona is provided', async () => {
  const template = await loadSystemPrompt('manager')
  const personaOnly = renderPromptTemplate(template, {
    ...baseTemplateValues,
    persona: 'name: mimikit',
  })
  expect(personaOnly).toContain('<M:persona>')
  expect(personaOnly).not.toContain('<M:user_profile>')
})

test('manager template renders user_profile block without persona block', async () => {
  const template = await loadSystemPrompt('manager')
  const userProfileOnly = renderPromptTemplate(template, {
    ...baseTemplateValues,
    user_profile: 'tone: concise',
  })
  expect(userProfileOnly).not.toContain('<M:persona>')
  expect(userProfileOnly).toContain('<M:user_profile>')
})

test('manager template renders action_feedback block when provided', async () => {
  const template = await loadSystemPrompt('manager')
  const withActionFeedback = renderPromptTemplate(template, {
    ...baseTemplateValues,
    action_feedback:
      'items:\n  - action: read\n    error: unregistered_action\n    hint: only registered actions are allowed',
  })
  expect(withActionFeedback).toContain('<M:action_feedback>')
  expect(withActionFeedback).toContain('unregistered_action')
})
