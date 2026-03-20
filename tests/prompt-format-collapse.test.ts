import { expect, test } from 'vitest'

import {
  buildHistoryLookupPromptPayload,
  buildInputsPromptPayload,
  buildQuoteReferenceLookup,
} from '../src/prompts/format-messages.js'
import { formatEnvironment } from '../src/prompts/format.js'
import {
  buildPlansPromptPayload,
  buildResultsPromptPayload,
  buildTasksPromptPayload,
} from '../src/prompts/format-content.js'
import type { HistoryMessage, TaskResult, UserInput } from '../src/types/index.js'
import {
  createPlanFixture,
  createTaskFixture,
  GLOBAL_FOCUS_ID,
} from './helpers/runtime-snapshot.js'

test('buildQuoteReferenceLookup keeps only agent-visible messages', () => {
  const history: HistoryMessage[] = [
    {
      id: 'msg-agent-1',
      role: 'agent',
      text: 'Agent history quote',
      createdAt: '2026-03-20T10:00:00.000Z',
      focusId: GLOBAL_FOCUS_ID,
    },
    {
      id: 'msg-system-hidden',
      role: 'system',
      visibility: 'user',
      text: 'Hidden from agent',
      createdAt: '2026-03-20T10:00:01.000Z',
      focusId: GLOBAL_FOCUS_ID,
    },
  ]
  const inputs: UserInput[] = [
    {
      id: 'input-user-1',
      role: 'user',
      text: 'Follow up',
      createdAt: '2026-03-20T10:01:00.000Z',
      focusId: GLOBAL_FOCUS_ID,
      quote: 'msg-agent-1',
      source: 'telegram',
      platform: 'tg',
    },
  ]
  const lookup = buildQuoteReferenceLookup({ history, inputs })
  const payload = buildInputsPromptPayload(inputs, lookup)

  expect(lookup.has('msg-agent-1')).toBe(true)
  expect(lookup.has('msg-system-hidden')).toBe(false)
  expect(payload?.messages[0]).toMatchObject({
    id: 'input-user-1',
    quote: 'msg-agent-1',
    quote_ref: {
      id: 'msg-agent-1',
      focus_id: GLOBAL_FOCUS_ID,
      content: 'Agent history quote',
    },
  })
})

test('buildHistoryLookupPromptPayload sorts by time desc then id', () => {
  const payload = buildHistoryLookupPromptPayload([
    {
      id: 'msg-b',
      role: 'agent',
      time: '2026-03-20T10:00:00.000Z',
      score: 0.8,
      content: 'B',
    },
    {
      id: 'msg-a',
      role: 'user',
      time: '2026-03-20T10:00:00.000Z',
      score: 0.7,
      content: 'A',
    },
    {
      id: 'msg-c',
      role: 'user',
      time: '2026-03-20T10:05:00.000Z',
      score: 0.9,
      content: 'C',
    },
  ])

  expect(payload?.messages.map((item) => item.id)).toEqual([
    'msg-c',
    'msg-a',
    'msg-b',
  ])
})

test('buildResultsPromptPayload keeps the latest result per task', () => {
  const task = createTaskFixture({
    id: 'task-collapse-1',
    title: 'Collapse format layer',
    prompt: 'Refactor prompt format',
  })
  const results: TaskResult[] = [
    {
      taskId: task.id,
      status: 'failed',
      ok: false,
      output: 'old result',
      durationMs: 100,
      completedAt: '2026-03-20T10:00:00.000Z',
      provider: 'codex',
    },
    {
      taskId: task.id,
      status: 'succeeded',
      ok: true,
      output: 'new result',
      durationMs: 90,
      completedAt: '2026-03-20T10:10:00.000Z',
      provider: 'codex',
    },
  ]
  const payload = buildResultsPromptPayload([task], results, '/tmp')

  expect(payload?.tasks).toHaveLength(1)
  expect(payload?.tasks[0]).toMatchObject({
    id: task.id,
    changed_at: '2026-03-20T10:10:00.000Z',
    result: {
      status: 'succeeded',
      ok: true,
    },
  })
})

test('buildTasksPromptPayload fallback and buildPlansPromptPayload title fallback', () => {
  const resultOnly: TaskResult = {
    taskId: 'task-result-only',
    status: 'partial',
    ok: false,
    output: 'partial output',
    durationMs: 42,
    completedAt: '2026-03-20T12:00:00.000Z',
    provider: 'codex',
  }
  const tasksPayload = buildTasksPromptPayload([], [resultOnly], '/tmp')
  const planPayload = buildPlansPromptPayload([
    createPlanFixture({
      id: 'plan-collapse-1',
      title: '',
      status: 'done',
      doneReason: 'completed',
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-03-20T13:00:00.000Z',
      },
    }),
  ])

  expect(tasksPayload?.tasks[0]).toMatchObject({
    id: 'task-result-only',
    status: 'paused',
    result: {
      status: 'partial',
    },
  })
  expect(planPayload?.plans[0]).toMatchObject({
    id: 'plan-collapse-1',
    title: 'plan-collapse-1',
    done_reason: 'completed',
  })
})

test('formatEnvironment does not expose provider candidate fields', () => {
  const formatted = formatEnvironment({
    workDir: '/tmp/work',
    env: {
      wakeProfile: 'user_input',
      workerSlots: {
        maxSlots: 2,
        occupiedSlots: 1,
        availableSlots: 1,
      },
    },
  })

  expect(formatted).toContain('wake_profile: user_input')
  expect(formatted).toContain('available_slots: 1')
  expect(formatted).not.toContain('provider_candidates')
  expect(formatted).not.toContain('provider_profiles')
})
