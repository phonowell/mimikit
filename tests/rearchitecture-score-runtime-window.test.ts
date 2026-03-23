import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { scoreRuntimeWindow } from '../scripts/rearchitecture/score-runtime-window-core.js'
import { evaluateContextScore } from '../scripts/rearchitecture/score-runtime-window-eval-context.js'
import { appendJsonl } from '../src/storage/jsonl.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-score-runtime-'))
const promptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  environmentMaxBytes: 4096,
  focusContextsMaxBytes: 20480,
  focusListMaxBytes: 8192,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  packetSummaryMaxBytes: 6144,
  plansMaxBytes: 16384,
  recentHistoryMaxBytes: 8192,
  tasksMaxBytes: 24576,
  workingFocusesMaxBytes: 20480,
}

test('scoreRuntimeWindow computes core governance metrics without not_collected blockers', async () => {
  const stateDir = await createTmpDir()
  await Promise.all([
    mkdir(join(stateDir, 'history'), { recursive: true }),
    mkdir(join(stateDir, 'task-progress', '2026-03-08'), { recursive: true }),
    mkdir(join(stateDir, 'inputs'), { recursive: true }),
    mkdir(join(stateDir, 'results'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(stateDir, 'runtime-snapshot.json'), JSON.stringify({
      schemaVersion: 'runtime-snapshot.v2',
      tasks: [],
      taskPlans: [],
      managerTurn: 0,
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
      memoryRefresh: {
        lastCompletedTurn: 0,
        signalVersion: 0,
        lastProcessedSignalVersion: 0,
      },
    }), 'utf8'),
    writeFile(join(stateDir, 'history', '2026-03-08.jsonl'), [
      JSON.stringify({
        id: 'hist-1',
        role: 'user',
        text: 'quoted message',
        createdAt: '2026-03-08T00:00:00.000Z',
        focusId: 'focus-alpha',
      }),
    ].join('\n') + '\n', 'utf8'),
    writeFile(join(stateDir, 'task-progress', '2026-03-08', 'task-1.jsonl'), [
      JSON.stringify({
        taskId: 'task-1',
        type: 'worker_start',
        createdAt: '2026-03-08T00:01:00.000Z',
        payload: {},
      }),
      JSON.stringify({
        taskId: 'task-1',
        type: 'worker_end',
        createdAt: '2026-03-08T00:01:05.000Z',
        payload: {},
      }),
    ].join('\n') + '\n', 'utf8'),
    writeFile(join(stateDir, 'golden.json'), JSON.stringify([
      {
        id: 'task-1',
        expected: {
          status: 'succeeded',
          requireEvidence: true,
        },
      },
    ]), 'utf8'),
  ])

  await appendJsonl(join(stateDir, 'inputs', 'packets.jsonl'), [
    {
      id: 'packet-input-1',
      createdAt: '2026-03-08T00:00:10.000Z',
      payload: {
        id: 'input-1',
        role: 'user',
        text: 'continue quoted thread',
        createdAt: '2026-03-08T00:00:10.000Z',
        focusId: 'focus-alpha',
        quote: 'hist-1',
      },
    },
  ])

  await appendJsonl(join(stateDir, 'results', 'packets.jsonl'), [
    {
      id: 'packet-result-1',
      createdAt: '2026-03-08T00:01:05.000Z',
      payload: {
        taskId: 'task-1',
        status: 'succeeded',
        completedAt: '2026-03-08T00:01:05.000Z',
        evidence: {
          contractGoal: 'deliver output',
          acceptanceChecks: [
            { criterion: 'has result', met: true },
          ],
          stateDelta: {
            taskStatusTo: 'succeeded',
          },
        },
      },
    },
  ])

  await appendJsonl(join(stateDir, 'log.jsonl'), [
    {
      time: '2026-03-08T00:00:11.000Z',
      event: 'trigger_fire_input',
      triggerReason: 'cron',
      planId: 'plan-1',
    },
    {
      time: '2026-03-08T00:00:12.000Z',
      event: 'run_task_dispatch',
      mode: 'created',
      taskId: 'task-1',
    },
    {
      time: '2026-03-08T00:00:20.000Z',
      event: 'manager_end',
    },
    {
      time: '2026-03-08T00:00:20.500Z',
      event: 'manager_context_budget_resolved',
      policy: 'fixed',
      wakeProfile: 'user_input',
      inputCount: 1,
      resultCount: 0,
      activeFocusCount: 1,
      promptSectionLimits,
    },
  ])

  const report = await scoreRuntimeWindow({
    workDir: stateDir,
    windowType: 'daily',
    windowFrom: '2026-03-08T00:00:00.000Z',
    windowTo: '2026-03-08T23:59:59.999Z',
    version: 'v1.3-stable',
    goldenSetPath: join(stateDir, 'golden.json'),
  })

  expect(report.governance.task_success_rate).toBe(1)
  expect(report.governance.contract_completeness_rate).toBe(1)
  expect(report.governance.evidence_quality_pass_rate).toBe(1)
  expect(report.governance.route_correct_rate).toBe(1)
  expect(report.governance.golden_replay_match_rate).toBe(1)
  expect(report.governance.cron_trigger_success_rate).toBe(1)
  expect(report.blockers.every((item) => !item.includes('not_collected'))).toBe(
    true,
  )
  expect(report.governance.context_budget_drift).toBe(0)
})

test('evaluateContextScore marks incomplete promptSectionLimits as drift', () => {
  const score = evaluateContextScore({
    logs: [
      {
        time: '2026-03-08T00:00:20.500Z',
        event: 'manager_context_budget_resolved',
        policy: 'fixed',
        wakeProfile: 'user_input',
        inputCount: 1,
        resultCount: 0,
        activeFocusCount: 1,
        promptSectionLimits: {
          actionFeedbackMaxBytes: 8192,
        },
      },
    ],
  })

  expect(score.budgetRows).toHaveLength(1)
  expect(score.driftRounds).toBe(1)
})
