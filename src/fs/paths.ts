import { join } from 'node:path'

export type StatePaths = {
  root: string
  inbox: string
  tellerInbox: string
  pendingQuestion: string
  history: string
  taskStatus: string
  memory: string
  memoryDir: string
  memorySummaryDir: string
  plannerQueue: string
  plannerRunning: string
  plannerResults: string
  workerQueue: string
  workerRunning: string
  workerResults: string
  triggers: string
  log: string
  llmDir: string
  archiveJobs: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  const memoryDir = join(root, 'memory')
  const memorySummaryDir = join(memoryDir, 'summary')
  return {
    root,
    inbox: join(root, 'inbox.json'),
    tellerInbox: join(root, 'teller_inbox.json'),
    pendingQuestion: join(root, 'pending_question.json'),
    history: join(root, 'history.json'),
    taskStatus: join(root, 'task_status.json'),
    memory: join(root, 'memory.md'),
    memoryDir,
    memorySummaryDir,
    plannerQueue: join(root, 'planner', 'queue'),
    plannerRunning: join(root, 'planner', 'running'),
    plannerResults: join(root, 'planner', 'results'),
    workerQueue: join(root, 'worker', 'queue'),
    workerRunning: join(root, 'worker', 'running'),
    workerResults: join(root, 'worker', 'results'),
    triggers: join(root, 'triggers'),
    log: join(root, 'log.jsonl'),
    llmDir: join(root, 'llm'),
    archiveJobs: join(memoryDir, 'archive_jobs.json'),
  }
}
