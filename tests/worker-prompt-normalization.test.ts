import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

import {
  WORKER_TASK_PROMPT_INLINE_MAX_BYTES,
  normalizeWorkerTaskPrompt,
} from '../src/prompts/build-worker-task-prompt.js'
import {
  buildWorkerPrompt,
} from '../src/prompts/build-prompts.js'

test('normalizeWorkerTaskPrompt extracts wrapped M:prompt content', () => {
  const raw = [
    '## 约束',
    '随便的外层说明',
    '<M:prompt>',
    '仅保留这段任务描述',
    '</M:prompt>',
    '<M:environment>',
    '- work_dir: /tmp/demo',
    '</M:environment>',
  ].join('\n')

  const normalized = normalizeWorkerTaskPrompt(raw)

  expect(normalized).toBe('仅保留这段任务描述')
})

test('normalizeWorkerTaskPrompt removes inline environment and extra blank lines', () => {
  const raw = ['任务A', '', '', '', '<M:environment>', '- k: v', '</M:environment>'].join(
    '\n',
  )
  const normalized = normalizeWorkerTaskPrompt(raw)
  expect(normalized).toBe('任务A')
})

test('buildWorkerPrompt externalizes oversized task prompt into generated dir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))
  const stateDir = resolve(root, '.mimikit')
  const workspaceDir = resolve(root, 'workspace')
  const prompt = `task: ${'detail '.repeat(260)}`
  const createdAt = '2026-03-04T12:34:56.000Z'

  const rendered = await buildWorkerPrompt({
    stateDir,
    workspaceDir,
    task: {
      id: 'task-worker-prompt-externalize',
      prompt,
      title: 'externalize prompt',
      cwd: workspaceDir,
      profile: 'worker',
      provider: 'codex',
      status: 'pending',
      createdAt,
      focusId: 'focus-global',
    },
  })

  expect(Buffer.byteLength(prompt, 'utf8')).toBeGreaterThan(
    WORKER_TASK_PROMPT_INLINE_MAX_BYTES,
  )
  expect(rendered).toContain('任务说明已按需外置以减少每步上下文体积。')
  expect(rendered).toContain('full_prompt_path:')

  const pathLine = rendered
    .split('\n')
    .find((line) => line.startsWith('full_prompt_path:'))
  expect(pathLine).toBeTruthy()
  if (!pathLine) throw new Error('missing full_prompt_path line')
  const fullPath = pathLine.slice('full_prompt_path:'.length).trim()

  const saved = await readFile(fullPath, 'utf8')
  expect(saved).toBe(normalizeWorkerTaskPrompt(prompt))
  expect(fullPath).toContain(
    '/generated/worker-task-prompts/2026-03-04/task-worker-prompt-externalize.md',
  )
})

test('buildWorkerPrompt injects related focus summary for worker context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mimikit-worker-focus-context-'))
  const stateDir = resolve(root, '.mimikit')
  const workspaceDir = resolve(root, 'workspace')
  const now = new Date().toISOString()

  const rendered = await buildWorkerPrompt({
    stateDir,
    workspaceDir,
    task: {
      id: 'task-worker-focus-context',
      prompt: '执行当前 focus 的交付任务',
      title: 'focus task',
      cwd: workspaceDir,
      profile: 'worker',
      provider: 'codex',
      status: 'pending',
      createdAt: now,
      focusId: 'focus-release',
    },
    focusMeta: {
      id: 'focus-release',
      title: 'Release Readiness',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    },
    focusContext: {
      focusId: 'focus-release',
      summary: '先完成回归测试并更新发布说明。',
      openItems: ['补齐发布 checklist', '确认回滚步骤'],
      updatedAt: now,
    },
    compressedFocusContext: {
      focusId: 'focus-release',
      summary: '目标是本周内完成发布并保留可回滚路径。',
      updatedAt: now,
    },
  })

  expect(rendered).toContain('<M:focus_context>')
  expect(rendered).toContain('"focus_id": "focus-release"')
  expect(rendered).toContain('"focus_title": "Release Readiness"')
  expect(rendered).toContain('"summary": "先完成回归测试并更新发布说明。"')
  expect(rendered).toContain('"open_items": [')
  expect(rendered).toContain('"compressed_summary": "目标是本周内完成发布并保留可回滚路径。"')
})
