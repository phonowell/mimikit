import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  notifyUiSignal,
  notifyWorkerLoop,
} from '../../kernel/orchestrator/signals.js'
import { appendTaskSystemMessage } from '../../persistence/history/task-events.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { clearTaskResumeChoice } from '../../work/orchestrator/task-resume-choice.js'
import { resumeRuntimeTask } from '../../work/orchestrator/task-state-write.js'
import { isBudgetRecoverableTask } from '../../work/shared/task-state.js'

import { enqueueWorkerTask } from './dispatch.js'
import {
  buildTaskMutationMetaFields,
  isDoneTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import { resolveSlotStatus, resolveTaskChangeAt } from './task-state-shared.js'

import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type ResumeMeta = {
  source?: string
  reason?: string
  resumeInstruction?: string
}

export type ResumeResult = {
  ok: boolean
  id: string
  status: 'pending' | 'not_found' | 'already_done' | 'not_paused' | 'invalid'
  changeAt?: string
}

export type ResumeRecoverableTasksResult = {
  ok: true
  resumedCount: number
  skippedCount: number
  items: ResumeResult[]
}

const normalizeResumeInstruction = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

export const resumeTask = async (
  runtime: WorkerRuntime,
  taskId: string,
  meta?: ResumeMeta,
): Promise<ResumeResult> => {
  const lookup = resolveTaskLookupTarget(runtime, taskId)
  if ('status' in lookup)
    return { ok: false, id: lookup.id, status: lookup.status }
  const { task } = lookup
  if (isDoneTaskStatus(task.status)) {
    return {
      ok: false,
      id: task.id,
      status: 'already_done',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  if (task.status !== 'paused') {
    return {
      ok: false,
      id: task.id,
      status: 'not_paused',
      changeAt: resolveTaskChangeAt(task),
    }
  }

  const resumedAt = nowIso()
  const resumeInstruction = normalizeResumeInstruction(meta?.resumeInstruction)
  touchTaskMutation(runtime, task.id)
  clearTaskResumeChoice(runtime, task.id)
  resumeRuntimeTask({
    runtime,
    taskId: task.id,
    ...(resumeInstruction ? { resumeInstruction } : {}),
  })

  await appendTaskSystemMessage(runtime.paths.history, 'resumed', task, {
    createdAt: resumedAt,
    slotStatus: resolveSlotStatus(runtime),
    resumeInstructionPresent: Boolean(resumeInstruction),
  })
  await bestEffort('appendLog: task_resumed', () =>
    appendLog(runtime.paths.log, {
      event: 'task_resumed',
      taskId: task.id,
      ...(resumeInstruction
        ? {
            resumeInstructionPresent: true,
            resumeInstructionChars: resumeInstruction.length,
          }
        : {}),
      ...buildTaskMutationMetaFields(meta),
    }),
  )
  await bestEffort('persistRuntimeState: task_resumed', () =>
    persistRuntimeState(runtime),
  )
  notifyUiSignal(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
  return {
    ok: true,
    id: task.id,
    status: 'pending',
    changeAt: resumedAt,
  }
}

export const resumeRecoverableTasks = async (
  runtime: WorkerRuntime,
): Promise<ResumeRecoverableTasksResult> => {
  const recoverableTasks = runtime.tasks.filter(isBudgetRecoverableTask)
  const items: ResumeResult[] = []
  for (const task of recoverableTasks) {
    items.push(
      await resumeTask(runtime, task.id, {
        source: 'user',
        reason: 'resume_all_recoverable',
      }),
    )
  }
  const resumedCount = items.filter(
    (item) => item.ok && item.status === 'pending',
  ).length
  return {
    ok: true,
    resumedCount,
    skippedCount: items.length - resumedCount,
    items,
  }
}
