import { expect, test } from 'vitest'

import {
  buildManagerTurnOutputSchema,
  parseManagerTurn,
} from '../src/policy/manager/manager-turn.js'

test('buildManagerTurnOutputSchema emits a closed top-level object for reply + actions', () => {
  expect(buildManagerTurnOutputSchema()).toMatchObject({
    type: 'json_schema',
    name: 'manager_turn',
    strict: true,
    schema: {
      type: 'object',
      required: ['reply', 'actions'],
      additionalProperties: false,
      properties: expect.objectContaining({
        reply: expect.any(Object),
        actions: expect.any(Object),
      }),
    },
  })
})

test('buildManagerTurnOutputSchema uses provider-compatible structured output envelope', () => {
  expect(buildManagerTurnOutputSchema()).toEqual(
    expect.objectContaining({
      type: 'json_schema',
      name: 'manager_turn',
      strict: true,
      schema: expect.any(Object),
    }),
  )
})

test('buildManagerTurnOutputSchema requires task.use_worktree inside nested task drafts', () => {
  const schema = buildManagerTurnOutputSchema().schema as {
    properties?: {
      actions?: {
        items?: {
          oneOf?: Array<{
            properties?: {
              task?: {
                required?: string[]
              }
              plan?: {
                properties?: {
                  task?: {
                    required?: string[]
                  }
                }
              }
            }
          }>
          anyOf?: Array<{
            properties?: {
              task?: {
                required?: string[]
              }
              plan?: {
                properties?: {
                  task?: {
                    required?: string[]
                  }
                }
              }
            }
          }>
        }
      }
    }
  }
  const actionSchemas =
    schema.properties?.actions?.items?.oneOf ??
    schema.properties?.actions?.items?.anyOf ??
    []
  const enqueueTask = actionSchemas.find(
    (item) => item.properties?.task?.required,
  )
  const setPlan = actionSchemas.find(
    (item) => item.properties?.plan?.properties?.task?.required,
  )

  expect(enqueueTask?.properties?.task?.required).toContain('use_worktree')
  expect(setPlan?.properties?.plan?.properties?.task?.required).toContain(
    'use_worktree',
  )
})

test('parseManagerTurn defaults missing task.use_worktree to false', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: 'read task',
          cwd: '/tmp/mimikit',
          mode: 'read',
          goal: '检查状态',
          in_scope: ['logs'],
          out_of_scope: [],
          done_when: ['返回结论'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      type: 'enqueue_task',
      task: {
        title: 'read task',
        cwd: '/tmp/mimikit',
        mode: 'read',
        use_worktree: false,
        goal: '检查状态',
        in_scope: ['logs'],
        out_of_scope: [],
        done_when: ['返回结论'],
        context_refs: [],
        instructions: [],
      },
    },
  ])
})
