import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPackets } from '../src/policy/prompts/manager-prompt-packet-build.js'
import { prepareManagerPromptRuntimeData } from '../src/policy/prompts/manager-prompt-runtime-data.js'
import { resolvePacketSectionPolicy } from '../src/policy/prompts/select-packet-sections.js'

const { readHistoryMock } = vi.hoisted(() => ({
  readHistoryMock: vi.fn(() => []),
}))

const { readMemoryEntriesMock } = vi.hoisted(() => ({
  readMemoryEntriesMock: vi.fn(() => []),
}))

vi.mock('../src/persistence/history/store.js', () => ({
  readHistory: readHistoryMock,
}))

vi.mock('../src/work/memory/store.js', () => ({
  readMemoryEntries: readMemoryEntriesMock,
}))

const parsePromptJson = (value: string): Record<string, unknown> =>
  JSON.parse(value) as Record<string, unknown>

test('manager packets surface one primary workline hint for the current batch', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-primary-workline',
  })
  const sectionPolicy = resolvePacketSectionPolicy({
    mode: 'minimal',
    wakeProfile: 'capacity',
  })
  const plans = [
    {
      id: 'plan-primary-workline',
      title: 'Primary workline plan',
      focusId: 'focus-b',
      priority: 'normal' as const,
      status: 'active' as const,
      createdAt: '2026-03-20T00:00:00.000Z',
      updatedAt: '2026-03-20T00:00:03.000Z',
      trigger: { mode: 'on_worker_slot_freed' as const },
      effect: {
        kind: 'enqueue_task' as const,
        taskKey: 'task-key-primary-workline',
        taskTemplate: {
          title: 'Ship the next billing step',
          cwd: '/repo',
          executionSpecId: 'spec-primary-workline',
        },
      },
      runtime: {
        runCount: 1,
        stage: {
          summary: '继续执行 billing 主线下一步收口',
          needsDecision: false,
          sourceTaskId: 'task-billing-next',
          updatedAt: '2026-03-20T00:00:06.000Z',
        },
      },
    },
  ]

  const runtime = await prepareManagerPromptRuntimeData(
    {
      stateDir: config.workDir,
      workDir: config.workDir,
      inputs: [],
      results: [],
      tasks: [],
      plans,
      promptSectionLimits: config.manager.promptSections,
      focuses: [
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:01.000Z',
          lastActivityAt: '2026-03-20T00:00:01.000Z',
        },
        {
          id: 'focus-b',
          title: 'Focus B',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
          summary: 'Billing 主线',
        },
      ],
      workingFocusIds: ['focus-b', 'focus-a'],
      wakeProfile: 'capacity',
      packetMode: 'minimal',
    },
    {
      includeTasks: sectionPolicy.tasks,
      includeInputs: sectionPolicy.inputs,
      includeProjectProfile: sectionPolicy.project_profile,
      includeRememberedMemory: sectionPolicy.remembered_memory,
      includeMemory: sectionPolicy.memory,
      includeWorkingFocuses: sectionPolicy.working_focuses,
      includeRecentHistory: sectionPolicy.recent_history,
    },
  )

  const packets = buildManagerPromptPackets({
    workDir: config.workDir,
    wakeProfile: 'capacity',
    packetMode: 'minimal',
    limits: config.manager.promptSections,
    runtime,
    inputs: [],
    tasks: [],
    plans,
    actionFeedback: [],
    workingFocusIds: ['focus-b', 'focus-a'],
    env: undefined,
    sectionPolicy,
  })

  expect(packets.contextPacket).toMatchObject({
    primaryWorkline: {
      focusId: 'focus-b',
      source: 'plan_stage',
      summary: '继续执行 billing 主线下一步收口',
      needsDecision: false,
      sourcePlanId: 'plan-primary-workline',
      sourceTaskId: 'task-billing-next',
    },
  })
  expect(parsePromptJson(packets.statePacket)).toMatchObject({
    primary_workline: {
      focus_id: 'focus-b',
      source: 'plan_stage',
      summary: '继续执行 billing 主线下一步收口',
      needs_decision: false,
      source_plan_id: 'plan-primary-workline',
      source_task_id: 'task-billing-next',
    },
  })
})
