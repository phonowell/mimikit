import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { resolveWorkerPromptFromDraft } from '../src/policy/manager/task-contract.js'
import { buildTaskFingerprint } from '../src/work/orchestrator/task-state.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceTaskContext,
  createIntentEvidenceUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('task_control cancel stays allowed for same-focus replacement batch', () => {
  const task = createIntentEvidenceTask({
    title: '修复 WebUI restart 与 scroll-bottom',
    cwd: '/repo/mimikit',
    fingerprint: buildTaskFingerprint({
      prompt: '复现并修复 WebUI restart 与 scroll-bottom',
      title: '修复 WebUI restart 与 scroll-bottom',
      cwd: '/repo/mimikit',
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-inbox',
      contract: {
        goal: '复现并修复两个 WebUI 问题',
        scope: '端到端修复与验证',
        acceptance: ['问题已修复'],
      },
    }),
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
      {
        type: 'enqueue_task',
        task: {
          title: '仅做 WebUI restart 与 scroll-bottom 的代码审查',
          cwd: '/repo/mimikit',
          mode: 'read',
          goal: '只对 WebUI restart 与 scroll-bottom 做代码审查',
          in_scope: ['阅读相关代码并给出审查结论'],
          out_of_scope: [],
          done_when: ['输出代码审查结论，不做修复'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      ...createIntentEvidenceTaskContext(task, [
        createIntentEvidenceUserInput(
          '不要继续刚才那个端到端修复了，改成只做 WebUI restart 与 scroll-bottom 的代码审查。',
        ),
      ]),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('task_control cancel stays blocked when a same-focus same-cwd unique active task is replaced without explicit cancel wording', () => {
  const task = createIntentEvidenceTask({
    title: '修复 WebUI restart 与 scroll-bottom',
    cwd: '/repo/mimikit',
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
      {
        type: 'enqueue_task',
        task: {
          title: '检查 Telegram 广播失败',
          cwd: '/repo/mimikit',
          mode: 'read',
          goal: '检查 Telegram 广播失败的原因',
          in_scope: ['阅读相关代码与日志'],
          out_of_scope: [],
          done_when: ['输出广播失败原因'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      ...createIntentEvidenceTaskContext(task, [
        createIntentEvidenceUserInput(
          '请检查 Telegram 广播失败的原因，只阅读相关代码与日志，并输出广播失败原因。',
        ),
      ]),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', task.id],
  })
})

test('task_control cancel stays blocked when replacement differs only by state-relative context ref normalization', () => {
  const stateDir = '/repo/mimikit/.mimikit'
  const enqueueTask = {
    title: 'Task 1',
    cwd: '/repo/mimikit',
    mode: 'read' as const,
    goal: '检查 archive/live fallback 语义',
    in_scope: ['只读核对 archive route 与 task archive'],
    out_of_scope: [],
    done_when: ['输出归档语义结论'],
    context_refs: ['tasks/2026-03-28/task-example.md'],
    instructions: [],
  }
  const prompt = resolveWorkerPromptFromDraft(enqueueTask, { stateDir })
  if (!prompt) throw new Error('expected prompt')
  const task = createIntentEvidenceTask({
    title: enqueueTask.title,
    cwd: enqueueTask.cwd,
    fingerprint: buildTaskFingerprint({
      prompt,
      title: enqueueTask.title,
      cwd: enqueueTask.cwd,
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-inbox',
      contract: {
        goal: enqueueTask.goal,
        scope: enqueueTask.in_scope[0] ?? '',
        acceptance: enqueueTask.done_when,
        contextRefs: enqueueTask.context_refs,
      },
    }),
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
      {
        type: 'enqueue_task',
        task: enqueueTask,
      },
    ],
    {
      ...createIntentEvidenceTaskContext(task, [
        createIntentEvidenceUserInput(
          '不要继续当前动作，改成只检查 archive/live fallback 语义，并输出归档语义结论。',
        ),
      ]),
      defaultFocusId: 'focus-inbox',
      stateDir,
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', task.id],
  })
})
