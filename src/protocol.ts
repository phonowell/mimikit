import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

export type AgentState = {
  status: 'idle' | 'running'
  lastAwakeAt?: string | undefined
  lastSleepAt?: string | undefined
}

export type TokenUsage = {
  input?: number
  output?: number
  total?: number
}

export type PendingTask = {
  id: string
  prompt: string
  createdAt: string
  origin?: 'self-awake' | 'event'
  selfAwakeRunId?: string
}

export type TaskResult = {
  id: string
  status: 'done' | 'failed'
  prompt?: string
  createdAt?: string
  result?: string
  error?: string
  completedAt: string
  usage?: TokenUsage
  origin?: 'self-awake' | 'event'
  selfAwakeRunId?: string
}

export type UserInput = {
  id: string
  text: string
  createdAt: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'agent'
  text: string
  createdAt: string
  usage?: TokenUsage
}

// Simple file-based mutex: serialize writes per path
const writeLocks = new Map<string, Promise<void>>()

const withLock = <T>(path: string, fn: () => Promise<T>): Promise<T> => {
  const prev = writeLocks.get(path) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  writeLocks.set(
    path,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

const MAX_HISTORY_FIELD_CHARS = 1200

const trimField = (value?: string): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.length <= MAX_HISTORY_FIELD_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_HISTORY_FIELD_CHARS)}...`
}

const trimTaskResult = (result: TaskResult): TaskResult => {
  const trimmed: TaskResult = {
    id: result.id,
    status: result.status,
    completedAt: result.completedAt,
  }
  if (result.createdAt !== undefined) trimmed.createdAt = result.createdAt
  if (result.origin !== undefined) trimmed.origin = result.origin
  if (result.selfAwakeRunId !== undefined)
    trimmed.selfAwakeRunId = result.selfAwakeRunId
  if (result.usage !== undefined) trimmed.usage = result.usage
  const prompt = trimField(result.prompt)
  if (prompt !== undefined) trimmed.prompt = prompt
  const output = trimField(result.result)
  if (output !== undefined) trimmed.result = output
  const error = trimField(result.error)
  if (error !== undefined) trimmed.error = error
  return trimmed
}

export class Protocol {
  constructor(private stateDir: string) {}

  getStateDir(): string {
    return this.stateDir
  }

  private get agentStatePath() {
    return join(this.stateDir, 'agent_state.json')
  }
  private get pendingTasksDir() {
    return join(this.stateDir, 'pending_tasks')
  }
  private get userInputPath() {
    return join(this.stateDir, 'user_input.json')
  }
  private get taskResultsDir() {
    return join(this.stateDir, 'task_results')
  }
  private get inflightTasksDir() {
    return join(this.stateDir, 'inflight_tasks')
  }
  private get taskHistoryPath() {
    return join(this.stateDir, 'task_history.json')
  }
  private get tasksLogPath() {
    return join(this.stateDir, 'tasks.md')
  }
  private get chatHistoryPath() {
    return join(this.stateDir, 'chat_history.json')
  }

  async init(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
    await mkdir(this.taskResultsDir, { recursive: true })
    await mkdir(this.pendingTasksDir, { recursive: true })
    await mkdir(this.inflightTasksDir, { recursive: true })
  }

  private async readTasksFromDir(dir: string): Promise<PendingTask[]> {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return []
    }
    const tasks: PendingTask[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const data = await readFile(join(dir, file), 'utf-8')
        tasks.push(JSON.parse(data) as PendingTask)
      } catch {
        // ignore corrupted files
      }
    }
    return tasks.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
  }

  // Agent State
  async getAgentState(): Promise<AgentState> {
    try {
      const data = await readFile(this.agentStatePath, 'utf-8')
      return JSON.parse(data) as AgentState
    } catch {
      return { status: 'idle' }
    }
  }

  async setAgentState(state: AgentState): Promise<void> {
    await writeFile(this.agentStatePath, JSON.stringify(state, null, 2))
  }

  // Pending Tasks (to be dispatched)
  getPendingTasks(): Promise<PendingTask[]> {
    return this.readTasksFromDir(this.pendingTasksDir)
  }

  getInflightTasks(): Promise<PendingTask[]> {
    return this.readTasksFromDir(this.inflightTasksDir)
  }

  async addPendingTask(task: PendingTask): Promise<void> {
    const path = join(this.pendingTasksDir, `${task.id}.json`)
    await writeFile(path, JSON.stringify(task, null, 2))
  }

  async claimPendingTasks(): Promise<PendingTask[]> {
    let files: string[]
    try {
      files = await readdir(this.pendingTasksDir)
    } catch {
      return []
    }
    const tasks: PendingTask[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const fromPath = join(this.pendingTasksDir, file)
      const inflightPath = join(this.inflightTasksDir, file)
      try {
        await rename(fromPath, inflightPath)
        const data = await readFile(inflightPath, 'utf-8')
        tasks.push(JSON.parse(data) as PendingTask)
      } catch {
        // ignore corrupted files
      }
    }
    return tasks.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
  }

  async returnPendingTask(task: PendingTask): Promise<void> {
    const inflightPath = join(this.inflightTasksDir, `${task.id}.json`)
    const pendingPath = join(this.pendingTasksDir, `${task.id}.json`)
    try {
      await rename(inflightPath, pendingPath)
    } catch {
      await writeFile(pendingPath, JSON.stringify(task, null, 2))
      try {
        await unlink(inflightPath)
      } catch {
        // ignore
      }
    }
  }

  async clearInflightTask(taskId: string): Promise<void> {
    const inflightPath = join(this.inflightTasksDir, `${taskId}.json`)
    try {
      await unlink(inflightPath)
    } catch {
      // ignore
    }
  }

  async restoreInflightTasks(): Promise<void> {
    let files: string[]
    try {
      files = await readdir(this.inflightTasksDir)
    } catch {
      return
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const inflightPath = join(this.inflightTasksDir, file)
      const pendingPath = join(this.pendingTasksDir, file)
      try {
        await rename(inflightPath, pendingPath)
      } catch {
        // ignore
      }
    }
  }

  // Task Results
  async writeTaskResult(result: TaskResult): Promise<void> {
    const path = join(this.taskResultsDir, `${result.id}.json`)
    await writeFile(path, JSON.stringify(result, null, 2))
    await this.appendTaskHistory(result)
  }

  async getTaskResults(): Promise<TaskResult[]> {
    let files: string[]
    try {
      files = await readdir(this.taskResultsDir)
    } catch {
      return []
    }
    const results: TaskResult[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const data = await readFile(join(this.taskResultsDir, file), 'utf-8')
        results.push(JSON.parse(data) as TaskResult)
      } catch {
        // ignore corrupted files
      }
    }
    return results
  }

  async clearTaskResult(taskId: string): Promise<void> {
    const path = join(this.taskResultsDir, `${taskId}.json`)
    try {
      await unlink(path)
    } catch {
      // ignore
    }
  }

  async getTaskHistory(limit = 200): Promise<TaskResult[]> {
    try {
      const data = await readFile(this.taskHistoryPath, 'utf-8')
      const history = JSON.parse(data) as TaskResult[]
      return history.slice(-limit)
    } catch {
      return []
    }
  }

  async appendTaskHistory(result: TaskResult): Promise<void> {
    await withLock(this.taskHistoryPath, async () => {
      const history = await this.getTaskHistory(1000)
      history.push(trimTaskResult(result))
      const trimmed = history.slice(-1000)
      await writeFile(this.taskHistoryPath, JSON.stringify(trimmed, null, 2))
    })
  }

  // User Input Queue
  async getUserInputs(): Promise<UserInput[]> {
    try {
      const data = await readFile(this.userInputPath, 'utf-8')
      return JSON.parse(data) as UserInput[]
    } catch {
      return []
    }
  }

  async addUserInput(input: UserInput): Promise<void> {
    await withLock(this.userInputPath, async () => {
      const inputs = await this.getUserInputs()
      inputs.push(input)
      await writeFile(this.userInputPath, JSON.stringify(inputs, null, 2))
    })
  }

  async removeUserInputs(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await withLock(this.userInputPath, async () => {
      const inputs = await this.getUserInputs()
      const idSet = new Set(ids)
      const remaining = inputs.filter((input) => !idSet.has(input.id))
      if (remaining.length === inputs.length) return
      await writeFile(this.userInputPath, JSON.stringify(remaining, null, 2))
    })
  }

  clearUserInputs(): Promise<UserInput[]> {
    return withLock(this.userInputPath, async () => {
      const inputs = await this.getUserInputs()
      await writeFile(this.userInputPath, '[]')
      return inputs
    })
  }

  // Tasks Log (append-only)
  async appendTaskLog(entry: string): Promise<void> {
    const line = `- ${new Date().toISOString()} ${entry}\n`
    try {
      await appendFile(this.tasksLogPath, line)
    } catch {
      await writeFile(this.tasksLogPath, `# Tasks Log\n\n${line}`)
    }
  }

  // Check for pending work
  async hasPendingWork(): Promise<boolean> {
    const [inputs, results] = await Promise.all([
      this.getUserInputs(),
      this.getTaskResults(),
    ])
    return inputs.length > 0 || results.length > 0
  }

  // Chat History
  async getChatHistory(limit = 50): Promise<ChatMessage[]> {
    try {
      const data = await readFile(this.chatHistoryPath, 'utf-8')
      const messages = JSON.parse(data) as ChatMessage[]
      return messages.slice(-limit)
    } catch {
      return []
    }
  }

  async addChatMessage(message: ChatMessage): Promise<void> {
    await withLock(this.chatHistoryPath, async () => {
      const messages = await this.getChatHistory(1000)
      messages.push(message)
      const trimmed = messages.slice(-1000)
      await writeFile(this.chatHistoryPath, JSON.stringify(trimmed, null, 2))
    })
  }
}
