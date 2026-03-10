import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'

test('buildManagerPromptPayload splits stable and volatile context segments', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-cache-split-'))
  const config = defaultConfig({ workDir: stateDir })

  const payload = await buildManagerPromptPayload({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-cache-split-1',
        role: 'user',
        text: '请继续推进任务',
        createdAt: '2026-03-07T10:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [
      {
        id: 'task-cache-split-1',
        fingerprint: 'fp-cache-split-1',
        prompt: '执行缓存命中优化验证',
        title: '缓存命中优化验证',
        focusId: 'focus-global',
        profile: 'worker',
        status: 'pending',
        createdAt: '2026-03-07T10:00:01.000Z',
      },
    ],
    plans: [
      {
        id: 'plan-cache-split-1',
        prompt: '持续推进缓存优化',
        title: '缓存优化计划',
        focusId: 'focus-global',
        profile: 'worker',
        priority: 'normal',
        source: 'user_request',
        status: 'active',
        trigger: { mode: 'on_worker_slot_freed' },
        createdAt: '2026-03-07T10:00:02.000Z',
        updatedAt: '2026-03-07T10:00:02.000Z',
        runCount: 0,
      },
    ],
    focuses: [
      {
        id: 'focus-global',
        title: '全局任务',
        status: 'active',
        createdAt: '2026-03-07T09:59:00.000Z',
        updatedAt: '2026-03-07T10:00:02.000Z',
        lastActivityAt: '2026-03-07T10:00:02.000Z',
      },
    ],
    focusContexts: [
      {
        focusId: 'focus-global',
        summary: '缓存优化待推进',
        updatedAt: '2026-03-07T10:00:02.000Z',
      },
    ],
    workingFocusIds: ['focus-global'],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(payload.prefix).toContain('## 工作边界')
  expect(payload.prefix).not.toContain('<M:inputs>')
  expect(payload.prefix).not.toContain('<M:environment>')
  expect(payload.suffix).toContain('<M:inputs>')
  expect(payload.suffix).toContain('<M:environment>')
  expect(payload.suffix).toContain('<M:tasks>')
  expect(payload.suffix).toContain('<M:focus_list>')
  expect(payload.prompt).toContain(payload.prefix)
  expect(payload.prompt).toContain(payload.suffix)
  expect(payload.promptSegments).toHaveLength(3)
  expect(payload.promptSegments[0]).toEqual({
    text: payload.prefix,
    cacheControl: 'ephemeral',
  })
  expect(payload.promptSegments[1]).toMatchObject({
    cacheControl: 'ephemeral',
  })
  expect(payload.promptSegments[1]?.text).toContain('<M:tasks>')
  expect(payload.promptSegments[1]?.text).toContain('<M:focus_list>')
  expect(payload.promptSegments[2]).toEqual({
    text: expect.any(String),
  })
  expect(payload.promptSegments[2]?.text).toContain('<M:inputs>')
  expect(payload.promptSegments[2]?.text).toContain('<M:environment>')
})
