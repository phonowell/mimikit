import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import type { Task, UserInput } from '../src/foundation/types/index.js'

test('enqueue_task(write) allows a concrete bugfix follow-up without extra gating', () => {
  const finishedTask: Task = {
    id: 'task-archive-link-report',
    fingerprint: 'task-archive-link-report-fingerprint',
    prompt: '调研并评分 mimikit 项目的设计与实现（10维）',
    title: '调研并评分 mimikit 项目的设计与实现（10维）',
    cwd: '/Users/mimiko/Projects/mimikit',
    focusId: 'focus-inbox',
    profile: 'worker',
    provider: 'codex',
    status: 'succeeded',
    resourceMode: 'read',
    createdAt: '2026-04-15T10:38:57.331Z',
    contract: {
      goal: '对 mimikit 项目的设计与实现做一次真实、客观、独立的仓库内调研，按 10 个不同维度进行十分制评分，并形成可直接回复用户的中文结论。',
      scope:
        '阅读仓库中的代码、目录结构、配置、脚本、文档与测试相关材料；从设计与实现两个层面提炼 10 个非重复评分维度。',
      acceptance: [
        '提交一份中文评分报告，包含恰好 10 个维度',
        '每个维度都包含名称、分数、简明理由、对应仓库证据位置或文件指向',
      ],
      outOfScope: '任何代码修改、提交、分支或 worktree 操作；浏览器相关验证',
      contextRefs: ['input-archive-link-report'],
    },
  }
  const input: UserInput = {
    id: 'input-followup-fix',
    role: 'user',
    text: '你给的链接无法打开，你需要排查这是否是一个 bug；如果是，你要妥善修复',
    createdAt: '2026-04-15T10:45:08.907Z',
    focusId: 'focus-inbox',
  }

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '排查并修复任务归档链接无法打开的问题',
          cwd: '/Users/mimiko/Projects/mimikit',
          mode: 'write',
          use_worktree: true,
          goal: '复现并定位任务归档链接无法打开的问题；确认是否为链接生成、路径解析、界面跳转或归档产物缺陷；若是缺陷则完成修复并验证。',
          in_scope: [
            '检查任务归档路径是否存在且可解析',
            '检查归档链接生成逻辑、渲染逻辑和打开链路',
            '必要时修改仓库实现与测试来修复问题',
          ],
          out_of_scope: ['与归档链接问题无关的产品改动'],
          done_when: [
            '明确给出是否为 bug 的结论及根因',
            '若为 bug，仓库内已完成修复并说明涉及文件',
            '提供修复后的验证结果',
          ],
          context_refs: ['input-followup-fix', finishedTask.id],
          instructions: ['以仓库内真实文件与实现为准', '开发必须使用 worktree'],
        },
      },
    ],
    {
      inputs: [input],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})
