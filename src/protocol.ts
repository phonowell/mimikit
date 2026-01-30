import { getAgentState, setAgentState } from './protocol-agent-state.js'
import { addChatMessage, getChatHistory } from './protocol-chat.js'
import { initProtocol } from './protocol-init.js'
import {
  addUserInput,
  clearUserInputs,
  getUserInputs,
  removeUserInputs,
} from './protocol-inputs.js'
import { appendTaskLog } from './protocol-log.js'
import { createProtocolPaths, type ProtocolPaths } from './protocol-paths.js'
import {
  appendTaskHistory,
  clearTaskResult,
  getTaskHistory,
  getTaskResults,
  writeTaskResult,
} from './protocol-results.js'
import {
  addPendingTask,
  claimPendingTasks,
  clearInflightTask,
  getInflightTasks,
  getPendingTasks,
  restoreInflightTasks,
  returnPendingTask,
} from './protocol-tasks.js'
import { hasPendingWork } from './protocol-work.js'

import type {
  AgentState,
  ChatMessage,
  PendingTask,
  TaskResult,
  UserInput,
} from './protocol-types.js'

export type {
  AgentState,
  TokenUsage,
  PendingTask,
  TaskResult,
  UserInput,
  ChatMessage,
} from './protocol-types.js'

export class Protocol {
  private paths: ProtocolPaths

  constructor(private stateDir: string) {
    this.paths = createProtocolPaths(stateDir)
  }

  getStateDir(): string {
    return this.stateDir
  }

  init(): Promise<void> {
    return initProtocol(this.paths)
  }

  getAgentState(): Promise<AgentState> {
    return getAgentState(this.paths)
  }

  setAgentState(state: AgentState): Promise<void> {
    return setAgentState(this.paths, state)
  }

  getPendingTasks(): Promise<PendingTask[]> {
    return getPendingTasks(this.paths)
  }

  getInflightTasks(): Promise<PendingTask[]> {
    return getInflightTasks(this.paths)
  }

  addPendingTask(task: PendingTask): Promise<void> {
    return addPendingTask(this.paths, task)
  }

  claimPendingTasks(): Promise<PendingTask[]> {
    return claimPendingTasks(this.paths)
  }

  returnPendingTask(task: PendingTask): Promise<void> {
    return returnPendingTask(this.paths, task)
  }

  clearInflightTask(taskId: string): Promise<void> {
    return clearInflightTask(this.paths, taskId)
  }

  restoreInflightTasks(): Promise<void> {
    return restoreInflightTasks(this.paths)
  }

  writeTaskResult(result: TaskResult): Promise<void> {
    return writeTaskResult(this.paths, result)
  }

  getTaskResults(): Promise<TaskResult[]> {
    return getTaskResults(this.paths)
  }

  clearTaskResult(taskId: string): Promise<void> {
    return clearTaskResult(this.paths, taskId)
  }

  getTaskHistory(limit = 200): Promise<TaskResult[]> {
    return getTaskHistory(this.paths, limit)
  }

  appendTaskHistory(result: TaskResult): Promise<void> {
    return appendTaskHistory(this.paths, result)
  }

  getUserInputs(): Promise<UserInput[]> {
    return getUserInputs(this.paths)
  }

  addUserInput(input: UserInput): Promise<void> {
    return addUserInput(this.paths, input)
  }

  removeUserInputs(ids: string[]): Promise<void> {
    return removeUserInputs(this.paths, ids)
  }

  clearUserInputs(): Promise<UserInput[]> {
    return clearUserInputs(this.paths)
  }

  appendTaskLog(entry: string): Promise<void> {
    return appendTaskLog(this.paths, entry)
  }

  hasPendingWork(): Promise<boolean> {
    return hasPendingWork(this.paths)
  }

  getChatHistory(limit = 50): Promise<ChatMessage[]> {
    return getChatHistory(this.paths, limit)
  }

  addChatMessage(message: ChatMessage): Promise<void> {
    return addChatMessage(this.paths, message)
  }
}
