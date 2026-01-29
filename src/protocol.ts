import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

export type AgentState = {
  status: 'idle' | 'running'
  lastAwakeAt?: string | undefined
  lastSleepAt?: string | undefined
  sessionId?: string | undefined
}

export type PendingTask = {
  id: string
  prompt: string
  createdAt: string
}

export type TaskResult = {
  id: string
  status: 'done' | 'failed'
  result?: string
  error?: string
  completedAt: string
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
}

// Simple file-based mutex: serialize writes per path
const writeLocks = new Map<string, Promise<void>>()

function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
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

export class Protocol {
  constructor(private stateDir: string) {}

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
  async getPendingTasks(): Promise<PendingTask[]> {
    let files: string[]
    try {
      files = await readdir(this.pendingTasksDir)
    } catch {
      return []
    }
    const tasks: PendingTask[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const data = await readFile(join(this.pendingTasksDir, file), 'utf-8')
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

  async addPendingTask(task: PendingTask): Promise<void> {
    const path = join(this.pendingTasksDir, `${task.id}.json`)
    await writeFile(path, JSON.stringify(task, null, 2))
  }

  async clearPendingTasks(): Promise<PendingTask[]> {
    let files: string[]
    try {
      files = await readdir(this.pendingTasksDir)
    } catch {
      return []
    }
    const tasks: PendingTask[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const path = join(this.pendingTasksDir, file)
      try {
        const data = await readFile(path, 'utf-8')
        tasks.push(JSON.parse(data) as PendingTask)
        await unlink(path)
      } catch {
        // ignore corrupted files
      }
    }
    return tasks.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
  }

  // Task Results
  async writeTaskResult(result: TaskResult): Promise<void> {
    const path = join(this.taskResultsDir, `${result.id}.json`)
    await writeFile(path, JSON.stringify(result, null, 2))
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
