import { expect, test } from 'vitest'

import { buildStructuredOutputTextFormat } from '../src/execution/providers/openai-responses-provider-structured.js'
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

test('buildManagerTurnOutputSchema does not expose legacy top-level decision field', () => {
  const outputSchema = buildManagerTurnOutputSchema().schema as {
    properties?: Record<string, unknown>
    required?: string[]
  }

  expect(outputSchema.required).not.toContain('decision')
  expect(outputSchema.properties?.decision).toBeUndefined()
})

test('provider structured output formatting keeps manager action branches closed and fully required', () => {
  const formatted = buildStructuredOutputTextFormat(
    buildManagerTurnOutputSchema(),
  ) as {
    format?: {
      schema?: {
        properties?: {
          actions?: {
            items?: {
              anyOf?: Array<{
                properties?: Record<string, unknown>
                required?: string[]
              }>
            }
          }
        }
      }
    }
  }

  const branches =
    formatted.format?.schema?.properties?.actions?.items?.anyOf ?? []

  expect(branches.length).toBeGreaterThan(0)
  for (const branch of branches) {
    const props = Object.keys(branch.properties ?? {})
    expect(branch.required).toEqual(props)
  }
})
