import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'
import { appendHistory } from '../storage/history-jsonl.js'
import { cancelTask } from '../worker/cancel-task.js'

import { applyCompressContext } from './action-apply-compress.js'
import {
  applyCreateTask,
  type ApplyTaskActionsOptions,
} from './action-apply-create.js'
import {
  applyCreateIntent,
  applyDeleteIntent,
  applyUpdateIntent,
} from './action-apply-intent.js'
import {
  cancelSchema,
  collectTaskResultSummaries,
  restartSchema,
} from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const requestManagerRestart = (runtime: RuntimeState): void => {
  setTimeout(() => {
    void (async () => {
      runtime.stopped = true
      notifyWorkerLoop(runtime)
      await bestEffort('persistRuntimeState: manager_restart', () =>
        persistRuntimeState(runtime),
      )
      process.exit(75)
    })()
  }, 100)
}

const appendCronCanceledSystemMessage = async (
  runtime: RuntimeState,
  cronJobId: string,
  title: string,
): Promise<void> => {
  const label = title.trim() || cronJobId
  const createdAt = nowIso()
  await appendHistory(runtime.paths.history, {
    id: `sys-cron-canceled-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary: `Canceled task "${label}".`,
      event: 'cron_canceled',
      payload: {
        cron_job_id: cronJobId,
        label,
        ...(title.trim() ? { title: title.trim() } : {}),
      },
    }),
    createdAt,
  })
}

export { collectTaskResultSummaries }

export const applyTaskActions = async (
  runtime: RuntimeState,
  items: Parsed[],
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.name === 'create_intent') {
      await applyCreateIntent(runtime, item)
      continue
    }
    if (item.name === 'update_intent') {
      await applyUpdateIntent(runtime, item)
      continue
    }
    if (item.name === 'delete_intent') {
      await applyDeleteIntent(runtime, item)
      continue
    }
    if (item.name === 'create_task') {
      await applyCreateTask(runtime, item, seen, options)
      continue
    }
    if (item.name === 'cancel_task') {
      const parsed = cancelSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      const { id } = parsed.data
      const canceled = await cancelTask(runtime, id, { source: 'deferred' })
      if (canceled.ok || canceled.status !== 'not_found') continue
      const cronJob = runtime.cronJobs.find((job) => job.id === id)
      if (!cronJob?.enabled) continue
      cronJob.enabled = false
      cronJob.disabledReason = 'canceled'
      await persistRuntimeState(runtime)
      await bestEffort('appendHistory: cron_task_canceled', () =>
        appendCronCanceledSystemMessage(runtime, cronJob.id, cronJob.title),
      )
      continue
    }
    if (item.name === 'compress_context') {
      await applyCompressContext(runtime, item)
      continue
    }
    if (item.name === 'restart_server') {
      const parsed = restartSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      requestManagerRestart(runtime)
      return
    }
  }
}
