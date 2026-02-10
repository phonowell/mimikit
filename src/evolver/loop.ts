import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { nowIso, sleep } from '../shared/utils.js'
import { readHistory } from '../storage/jsonl.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const appendMarkdownSection = async (params: {
  path: string
  title: string
  lines: string[]
}): Promise<void> => {
  const current = await readFile(params.path, 'utf8')
  const body = [
    current.trimEnd(),
    '',
    `## ${params.title}`,
    ...params.lines,
    '',
  ].join('\n')
  await writeFile(params.path, body, 'utf8')
}

const summarizeTaskStats = (runtime: RuntimeState): string[] => {
  const pending = runtime.tasks.filter(
    (task) => task.status === 'pending',
  ).length
  const running = runtime.tasks.filter(
    (task) => task.status === 'running',
  ).length
  const succeeded = runtime.tasks.filter(
    (task) => task.status === 'succeeded',
  ).length
  const failed = runtime.tasks.filter((task) => task.status === 'failed').length
  const canceled = runtime.tasks.filter(
    (task) => task.status === 'canceled',
  ).length
  const slowTasks = runtime.tasks.filter(
    (task) =>
      typeof task.durationMs === 'number' &&
      task.durationMs >= runtime.config.reporting.runtimeHighLatencyMs,
  ).length
  const highUsageTasks = runtime.tasks.filter(
    (task) =>
      (task.usage?.total ?? 0) >=
      runtime.config.reporting.runtimeHighUsageTotal,
  ).length
  return [
    `- pending: ${pending}`,
    `- running: ${running}`,
    `- succeeded: ${succeeded}`,
    `- failed: ${failed}`,
    `- canceled: ${canceled}`,
    `- high_latency_tasks: ${slowTasks}`,
    `- high_usage_tasks: ${highUsageTasks}`,
  ]
}

const summarizeRecentUserMessages = async (
  runtime: RuntimeState,
): Promise<string[]> => {
  const history = await readHistory(runtime.paths.history)
  const recent = history
    .filter((item) => item.role === 'user')
    .slice(-5)
    .map((item) => item.text.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length > 0)
  if (recent.length === 0) return ['- 无新增用户输入']
  return recent.map((item, index) => `- recent_user_${index + 1}: ${item}`)
}

const writeAgentPersonaVersion = async (
  runtime: RuntimeState,
  stamp: string,
): Promise<void> => {
  const versionPath = join(runtime.paths.agentPersonaVersionsDir, `${stamp}.md`)
  const body = [
    '# Agent Persona Snapshot',
    '',
    `- updated_at: ${stamp}`,
    '-原则：准确、简洁、先完成用户请求。',
    '-语气：直接、礼貌、可执行。',
    '',
  ].join('\n')
  await writeFile(versionPath, body, 'utf8')
}

export const evolverLoop = async (runtime: RuntimeState): Promise<void> => {
  let idleSince = 0
  while (!runtime.stopped) {
    const activeTasks = runtime.runningControllers.size
    const pendingTasks = runtime.tasks.filter(
      (task) => task.status === 'pending',
    ).length
    const busy =
      runtime.managerRunning ||
      activeTasks > 0 ||
      pendingTasks > 0 ||
      runtime.inflightInputs.length > 0

    if (busy) {
      idleSince = 0
      await sleep(runtime.config.evolver.pollMs)
      continue
    }

    const now = Date.now()
    if (idleSince === 0) {
      idleSince = now
      await sleep(runtime.config.evolver.pollMs)
      continue
    }

    if (now - idleSince < runtime.config.evolver.idleThresholdMs) {
      await sleep(runtime.config.evolver.pollMs)
      continue
    }

    if (
      runtime.lastEvolverRunAt !== undefined &&
      now - runtime.lastEvolverRunAt < runtime.config.evolver.minIntervalMs
    ) {
      await sleep(runtime.config.evolver.pollMs)
      continue
    }

    const stamp = nowIso()
    runtime.lastEvolverRunAt = now

    try {
      await appendMarkdownSection({
        path: runtime.paths.feedback,
        title: `Feedback ${stamp}`,
        lines: ['- 来源：history + tasks', ...summarizeTaskStats(runtime)],
      })
      await appendMarkdownSection({
        path: runtime.paths.userProfile,
        title: `Profile Update ${stamp}`,
        lines: await summarizeRecentUserMessages(runtime),
      })
      await appendMarkdownSection({
        path: runtime.paths.agentPersona,
        title: `Persona Update ${stamp}`,
        lines: [
          '- 目标：高效率、低费用、准确完成请求。',
          '- 策略：优先复用任务，避免重复派单。',
          '- 约束：不编造事实，优先暴露不确定性。',
        ],
      })
      await writeAgentPersonaVersion(runtime, stamp)
      await appendLog(runtime.paths.log, {
        event: 'evolver_end',
        status: 'ok',
        at: stamp,
      })
    } catch (error) {
      await bestEffort('appendLog: evolver_end_error', () =>
        appendLog(runtime.paths.log, {
          event: 'evolver_end',
          status: 'error',
          at: stamp,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }

    await sleep(runtime.config.evolver.pollMs)
  }
}
