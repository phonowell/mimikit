import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

import type { PromptSectionLimits } from '../src/config.js'

const promptSectionLimits: PromptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  environmentMaxBytes: 4096,
  fileLookupMaxBytes: 20480,
  focusContextsMaxBytes: 20480,
  focusListMaxBytes: 8192,
  historyLookupMaxBytes: 20480,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  packetSummaryMaxBytes: 6144,
  plansMaxBytes: 16384,
  queryLookupMaxBytes: 20480,
  recentHistoryMaxBytes: 8192,
  tasksMaxBytes: 24576,
}

const ACTION_SURFACE_START = '## 当前可用 Action 面（代码生成）'
const ACTION_SURFACE_END = '## 关键参数与枚举'

const extractActionSurface = (prompt: string): string => {
  const startIndex = prompt.indexOf(ACTION_SURFACE_START)
  const endIndex = prompt.indexOf(ACTION_SURFACE_END)
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error('failed to locate manager action surface section')
  }
  return prompt.slice(startIndex, endIndex)
}

test('manager prompt narrows action surface for task_result wake profile', async () => {
  const stateDir = await mkdtemp(
    join(tmpdir(), 'mimikit-manager-prompt-action-surface-'),
  )
  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [],
    results: [],
    tasks: [],
    promptSectionLimits,
    wakeProfile: 'task_result',
  })

  const surface = extractActionSurface(prompt)

  expect(surface).toContain(
    '当前 wake_profile=`task_result`；未列出的 action 视为本轮不可用。',
  )
  expect(surface).toContain('`M:create_plan`：创建持续触发计划')
  expect(surface).toContain('`M:enqueue_task`：派发一个 worker 任务')
  expect(surface).not.toContain('`M:remember_memory`')
  expect(surface).not.toContain('`M:upsert_focus`')
  expect(surface).not.toContain('`M:ask_user_choice`')
})
