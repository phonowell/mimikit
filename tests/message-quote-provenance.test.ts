import { expect, test } from 'vitest'

import {
  buildInputsPromptPayload,
  buildQuoteReferenceLookup,
} from '../src/foundation/prompting/format.js'
import { readHistory } from '../src/persistence/history/store.js'
import { appendManagerBatchReply } from '../src/policy/manager/loop-batch-reply.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type {
  HistoryMessage,
  TaskResult,
  UserInput,
} from '../src/foundation/types/index.js'

test('buildInputsPromptPayload carries message provenance on quoted manager replies', () => {
  const history = [
    {
      id: 'agent-1',
      role: 'agent',
      text: '这次只做基线研究，不需要额外复评分支。',
      createdAt: '2026-04-16T08:00:00.000Z',
      focusId: 'focus-main',
      sourceInputIds: ['input-1'],
      sourcePlanIds: ['plan-score'],
    },
  ] as HistoryMessage[]
  const input: UserInput = {
    id: 'input-2',
    role: 'user',
    text: '我是在修正你上条规则，不是让你停掉当前任务。',
    createdAt: '2026-04-16T08:01:00.000Z',
    focusId: 'focus-main',
    source: 'webui',
    platform: 'webui',
    quote: 'agent-1',
  }

  const payload = buildInputsPromptPayload(
    [input],
    buildQuoteReferenceLookup({ history, inputs: [input] }),
  )

  expect(payload?.messages[0]?.quote_ref).toMatchObject({
    id: 'agent-1',
    source_input_ids: ['input-1'],
    source_plan_ids: ['plan-score'],
  })
  expect(payload?.messages[0]?.quote_ref).not.toHaveProperty('source_task_ids')
})

test('buildInputsPromptPayload extracts task provenance from quoted system task messages', () => {
  const history = [
    {
      id: 'sys-task-1',
      role: 'system',
      visibility: 'user',
      text: 'Task "Node logging 基线重打分" completed successfully.',
      createdAt: '2026-04-16T08:10:00.000Z',
      focusId: 'focus-main',
      systemEventName: 'task_completed',
      systemEventPayload: {
        task_id: 'task-node-score',
      },
    },
  ] as HistoryMessage[]
  const input: UserInput = {
    id: 'input-3',
    role: 'user',
    text: '这个结论没问题，但刚才补充的通用规则不适用于当前这次。',
    createdAt: '2026-04-16T08:11:00.000Z',
    focusId: 'focus-main',
    source: 'webui',
    platform: 'webui',
    quote: 'sys-task-1',
  }

  const payload = buildInputsPromptPayload(
    [input],
    buildQuoteReferenceLookup({ history, inputs: [input] }),
  )

  expect(payload?.messages[0]?.quote_ref).toMatchObject({
    id: 'sys-task-1',
    source_task_ids: ['task-node-score'],
  })
})

test('appendManagerBatchReply persists batch provenance on appended manager replies', async () => {
  const runtime = await createTestRuntimeState()
  const userInput: UserInput = {
    id: 'input-user-1',
    role: 'user',
    text: '以后这类打分类任务都多加一道独立复评分支。',
    createdAt: '2026-04-16T08:20:00.000Z',
    focusId: 'focus-main',
    source: 'webui',
    platform: 'webui',
  }
  const triggerInput: UserInput = {
    id: 'input-trigger-1',
    role: 'system',
    visibility: 'user',
    text: 'Trigger fired.',
    createdAt: '2026-04-16T08:20:05.000Z',
    focusId: 'focus-main',
    systemEventName: 'trigger_fire',
    systemEventPayload: {
      plan_id: 'plan-score',
    },
  }
  const result: TaskResult = {
    taskId: 'task-node-score',
    status: 'succeeded',
    ok: true,
    output: 'baseline done',
    completedAt: '2026-04-16T08:20:10.000Z',
    profile: 'worker',
    provider: 'codex',
  }

  await appendManagerBatchReply({
    runtime,
    agentInputs: [userInput, triggerInput],
    results: [result],
    normalizedReplyText: '收到，规则已更新；当前这次仍按纯研究基线处理。',
    nextInputsCursor: 2,
  })

  const history = await readHistory(runtime.paths.history)
  const reply = history.find((item) => item.role === 'agent')
  expect(reply).toMatchObject({
    sourceInputIds: ['input-user-1', 'input-trigger-1'],
    sourceTaskIds: ['task-node-score'],
    sourcePlanIds: ['plan-score'],
  })
})
