import { expect, test } from 'vitest'

import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurfacePromptConfig,
} from '../src/policy/manager/action-surface-prompt.js'

const collectRenderedActionNames = (prompt: string): string[] =>
  [...prompt.matchAll(/`type="([^"]+)"`/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  )

const countRenderedActionName = (prompt: string, actionName: string): number =>
  collectRenderedActionNames(prompt).filter((item) => item === actionName)
    .length

test('feedback-driven prompt expansion only adds details for failed registered actions', () => {
  const config = resolveManagerActionSurfacePromptConfig({
    actionFeedback: [
      {
        action: 'enqueue_task',
        error: 'action_execution_rejected',
        hint: 'blocked',
      },
      {
        action: 'unknown_action',
        error: 'action_execution_rejected',
        hint: 'ignored',
      },
    ],
  })

  expect(config.includeAllDetails).toBe(false)
  expect([...config.detailActionNames]).toEqual(['enqueue_task'])

  const prompt = formatManagerActionSurfacePrompt(config)
  const actionNames = Array.from(config.surface.actionNames).sort()

  expect([...new Set(collectRenderedActionNames(prompt))].sort()).toEqual(
    actionNames,
  )
  for (const actionName of actionNames) {
    expect(countRenderedActionName(prompt, actionName)).toBe(
      actionName === 'enqueue_task' ? 2 : 1,
    )
  }
})

test('expanded prompt renders one summary line and one detail line per registered action', () => {
  const config = resolveManagerActionSurfacePromptConfig({
    packetMode: 'expanded',
  })

  expect(config.includeAllDetails).toBe(true)
  expect(config.detailActionNames.size).toBe(0)

  const prompt = formatManagerActionSurfacePrompt(config)
  const actionNames = Array.from(config.surface.actionNames).sort()

  expect([...new Set(collectRenderedActionNames(prompt))].sort()).toEqual(
    actionNames,
  )
  for (const actionName of actionNames)
    expect(countRenderedActionName(prompt, actionName)).toBe(2)
})
