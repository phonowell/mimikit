import { listItems } from '../storage/queue.js'
import { listTriggers } from '../storage/triggers.js'

import type { ToolContext } from './context.js'
import type {
  PlannerResult,
  Task,
  Trigger,
  WorkerResult,
} from '../types/tasks.js'

export type ListTasksArgs = {
  scope?: 'queue' | 'running' | 'triggers' | 'all'
  role?: 'planner' | 'worker'
}

export type TaskSummary = {
  id: string
  type: string
  prompt: string
  priority: number
  status: 'queued' | 'running' | 'done' | 'failed' | 'trigger'
  createdAt: string
  traceId?: string
}

const summarizeTask = (
  task: Task,
  status: TaskSummary['status'],
): TaskSummary => ({
  id: task.id,
  type: task.type,
  prompt: task.prompt,
  priority: task.priority,
  status,
  createdAt: task.createdAt,
  ...(task.traceId ? { traceId: task.traceId } : {}),
})

const summarizeResult = (
  result: WorkerResult | PlannerResult,
): TaskSummary => ({
  id: result.id,
  type: 'oneshot',
  prompt: '',
  priority: 0,
  status:
    result.status === 'failed'
      ? 'failed'
      : result.status === 'needs_input'
        ? 'queued'
        : 'done',
  createdAt: result.completedAt,
  ...(result.traceId ? { traceId: result.traceId } : {}),
})

const summarizeTrigger = (trigger: Trigger): TaskSummary => ({
  id: trigger.id,
  type: trigger.type,
  prompt: trigger.prompt,
  priority: trigger.priority,
  status: 'trigger',
  createdAt: trigger.createdAt,
  ...(trigger.traceId ? { traceId: trigger.traceId } : {}),
})

export const listTasks = async (ctx: ToolContext, args: ListTasksArgs) => {
  const scope = args.scope ?? 'all'
  const tasks: TaskSummary[] = []

  if (scope === 'queue' || scope === 'all') {
    if (!args.role || args.role === 'planner') {
      const items = await listItems<Task>(ctx.paths.plannerQueue)
      tasks.push(...items.map((t) => summarizeTask(t, 'queued')))
    }
    if (!args.role || args.role === 'worker') {
      const items = await listItems<Task>(ctx.paths.workerQueue)
      tasks.push(...items.map((t) => summarizeTask(t, 'queued')))
    }
  }

  if (scope === 'running' || scope === 'all') {
    if (!args.role || args.role === 'planner') {
      const items = await listItems<Task>(ctx.paths.plannerRunning)
      tasks.push(...items.map((t) => summarizeTask(t, 'running')))
    }
    if (!args.role || args.role === 'worker') {
      const items = await listItems<Task>(ctx.paths.workerRunning)
      tasks.push(...items.map((t) => summarizeTask(t, 'running')))
    }
  }

  if (scope === 'all') {
    const workerResults = await listItems<WorkerResult>(ctx.paths.workerResults)
    const plannerResults = await listItems<PlannerResult>(
      ctx.paths.plannerResults,
    )
    tasks.push(...workerResults.map((r) => summarizeResult(r)))
    tasks.push(...plannerResults.map((r) => summarizeResult(r)))
  }

  if (scope === 'triggers' || scope === 'all') {
    const triggers = await listTriggers(ctx.paths.triggers)
    tasks.push(...triggers.map(summarizeTrigger))
  }

  return { tasks }
}
