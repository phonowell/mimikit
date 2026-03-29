import { expect, test } from 'vitest'

import {
  buildManagerTurnOutputSchema,
  parseManagerTurn,
} from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn strips null optional fields from structured output', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'task_control',
        task_id: 'task-resume-target',
        action: 'resume',
        instructions: null,
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      type: 'task_control',
      task_id: 'task-resume-target',
      action: 'resume',
    },
  ])
})

test('buildManagerTurnOutputSchema exposes optional action fields as required nullable fields', () => {
  const outputSchema = buildManagerTurnOutputSchema()
  const actionItems = ((
    (
      outputSchema.schema as {
        properties?: Record<string, unknown>
      }
    ).properties?.actions as {
      items?: { anyOf?: unknown[]; oneOf?: unknown[] }
    }
  ).items ?? {}) as {
    anyOf?: unknown[]
    oneOf?: unknown[]
  }
  const actionBranches = (actionItems.anyOf ??
    actionItems.oneOf ??
    []) as Array<{
    properties?: Record<string, unknown>
    required?: string[]
  }>
  const taskControlSchema = actionBranches.find(
    (branch) =>
      (
        branch.properties?.type as {
          const?: string
        }
      ).const === 'task_control',
  )

  expect(taskControlSchema).toBeDefined()
  expect(taskControlSchema?.required).toContain('instructions')
  expect(taskControlSchema?.properties?.instructions).toEqual(
    expect.objectContaining({
      anyOf: expect.arrayContaining([{ type: 'null' }]),
    }),
  )
})
