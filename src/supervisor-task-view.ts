import type {
  PendingTask,
  Protocol,
  TaskResult,
  TokenUsage,
} from './protocol.js'

export type TaskView = {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  title: string
  createdAt?: string
  completedAt?: string
  usage?: TokenUsage
}

export type TaskCounts = {
  pending: number
  running: number
  done: number
  failed: number
}

type TaskTitleInput = {
  id: string
  prompt?: string
  result?: string
  error?: string
}

const makeTaskTitle = (input: TaskTitleInput): string => {
  const raw =
    input.prompt ?? input.result ?? (input.error ? `Error: ${input.error}` : '')
  const line =
    raw
      .split('\n')
      .find((item) => item.trim())
      ?.trim() ?? ''
  if (!line) return input.id
  if (line.length <= 120) return line
  return `${line.slice(0, 117)}...`
}

const buildTitleInput = (
  id: string,
  fields: {
    prompt?: string | undefined
    result?: string | undefined
    error?: string | undefined
  },
): TaskTitleInput => {
  const input: TaskTitleInput = { id }
  if (fields.prompt !== undefined) input.prompt = fields.prompt
  if (fields.result !== undefined) input.result = fields.result
  if (fields.error !== undefined) input.error = fields.error
  return input
}

const taskTime = (task: TaskView): number => {
  const iso = task.completedAt ?? task.createdAt
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

const taskToView = (
  task: PendingTask,
  status: 'pending' | 'running',
): TaskView => ({
  id: task.id,
  status,
  title: makeTaskTitle({ id: task.id, prompt: task.prompt }),
  createdAt: task.createdAt,
})

const resultToView = (result: TaskResult): TaskView => {
  const view: TaskView = {
    id: result.id,
    status: result.status,
    title: makeTaskTitle(
      buildTitleInput(result.id, {
        prompt: result.prompt,
        result: result.result,
        error: result.error,
      }),
    ),
    completedAt: result.completedAt,
  }
  if (result.createdAt !== undefined) view.createdAt = result.createdAt
  if (result.usage !== undefined) view.usage = result.usage
  return view
}

const countTasks = (tasks: TaskView[]): TaskCounts => {
  const counts: TaskCounts = { pending: 0, running: 0, done: 0, failed: 0 }
  for (const task of tasks) counts[task.status]++
  return counts
}

export const buildTaskViews = async (
  protocol: Protocol,
  limit = 200,
): Promise<{ tasks: TaskView[]; counts: TaskCounts }> => {
  const [pending, inflight, history] = await Promise.all([
    protocol.getPendingTasks(),
    protocol.getInflightTasks(),
    protocol.getTaskHistory(),
  ])

  const tasks: TaskView[] = [
    ...pending.map((task) => taskToView(task, 'pending')),
    ...inflight.map((task) => taskToView(task, 'running')),
    ...history.map((result) => resultToView(result)),
  ]

  tasks.sort((a, b) => taskTime(b) - taskTime(a))

  const limited = tasks.slice(0, Math.max(0, limit))
  const counts = countTasks(limited)
  return { tasks: limited, counts }
}
