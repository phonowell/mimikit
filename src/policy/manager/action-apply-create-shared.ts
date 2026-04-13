import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import type { TaskContract } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const logRunTaskDispatch = async (
  runtime: ManagerRuntime,
  params: {
    taskId: string
    mode: 'reuse_pending' | 'resume_paused' | 'created'
  },
): Promise<void> => {
  const slots = resolveSlotStatus(runtime)
  await bestEffort('appendLog: run_task_dispatch', () =>
    appendLog(runtime.paths.log, {
      event: 'run_task_dispatch',
      taskId: params.taskId,
      mode: params.mode,
      availableSlots: slots.available_slots,
      occupiedSlots: slots.occupied_slots,
      maxSlots: slots.max_slots,
    }),
  )
}

export const buildRunTaskBatchKey = (params: {
  prompt: string
  title: string
  cwd: string
  profile: string
  provider: string
  focusId: string
  repoKey?: string
  branch?: string
  contract: TaskContract
}): string =>
  [
    params.prompt,
    params.title,
    params.cwd,
    params.profile,
    params.provider,
    params.focusId,
    params.repoKey ?? '',
    params.branch ?? '',
    params.contract.goal,
    params.contract.scope,
    ...params.contract.acceptance,
    params.contract.outOfScope ?? '',
    ...(params.contract.contextRefs ?? []),
  ].join('\n')
