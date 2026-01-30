import { join } from 'node:path'

export type ProtocolPaths = {
  stateDir: string
  agentStatePath: string
  pendingTasksDir: string
  userInputPath: string
  taskResultsDir: string
  inflightTasksDir: string
  taskHistoryPath: string
  tasksLogPath: string
  chatHistoryPath: string
}

export const createProtocolPaths = (stateDir: string): ProtocolPaths => ({
  stateDir,
  agentStatePath: join(stateDir, 'agent_state.json'),
  pendingTasksDir: join(stateDir, 'pending_tasks'),
  userInputPath: join(stateDir, 'user_input.json'),
  taskResultsDir: join(stateDir, 'task_results'),
  inflightTasksDir: join(stateDir, 'inflight_tasks'),
  taskHistoryPath: join(stateDir, 'task_history.json'),
  tasksLogPath: join(stateDir, 'tasks.md'),
  chatHistoryPath: join(stateDir, 'chat_history.json'),
})
