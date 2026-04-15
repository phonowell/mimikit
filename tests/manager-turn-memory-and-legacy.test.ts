import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

const parseRememberProjectProfile = (action: {
  content: string
  source_input_id: string
  source_quote?: string
}) =>
  parseManagerTurn({
    reply: '收到。',
    actions: [{ type: 'remember_project_profile', ...action }],
  }).actions

test('parseManagerTurn keeps structured remember_project_profile action as-is', () => {
  expect(
    parseRememberProjectProfile({
      content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
      source_input_id: 'input-user',
      source_quote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
    }),
  ).toEqual([
    {
      type: 'remember_project_profile',
      content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
      source_input_id: 'input-user',
      source_quote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
    },
  ])
})

test('parseManagerTurn allows remember_project_profile without source_quote', () => {
  expect(
    parseRememberProjectProfile({
      content: '本仓库默认走 wt 开发闭环。',
      source_input_id: 'input-user',
    }),
  ).toEqual([
    {
      type: 'remember_project_profile',
      content: '本仓库默认走 wt 开发闭环。',
      source_input_id: 'input-user',
    },
  ])
})

test('parseManagerTurn drops low-risk legacy top-level fields and unknown actions', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    decision: {
      mode: 'escalate',
      reason: 'evidence_conflict',
    },
    actions: [
      {
        type: 'record_task_git',
        task_id: 'task-auth-guard',
        state: 'merged',
        source_input_id: 'input-user',
        source_quote: '已合并到 main',
      },
      {
        type: 'enqueue_task',
        continuation_of: {
          type: 'plan',
          id: 'plan-current-anchor',
        },
        task: {
          title: '继续推进当前主线',
          cwd: '/tmp/mimikit',
          mode: 'write',
          goal: '继续推进当前主线并落地修改',
          in_scope: ['主线续跑'],
          out_of_scope: [],
          done_when: ['下一步主线完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
  })

  expect(parsed.reply).toBe('收到。')
  expect(parsed.actions).toEqual([
    {
      type: 'enqueue_task',
      task: {
        title: '继续推进当前主线',
        cwd: '/tmp/mimikit',
        mode: 'write',
        use_worktree: false,
        goal: '继续推进当前主线并落地修改',
        in_scope: ['主线续跑'],
        out_of_scope: [],
        done_when: ['下一步主线完成'],
        context_refs: [],
        instructions: [],
      },
    },
  ])
})
