export type SupervisorConfig = {
  stateDir: string
  workDir: string
  model?: string | undefined
  checkIntervalMs?: number | undefined
  selfAwakeIntervalMs?: number | undefined
  taskTimeout?: number | undefined
  maxConcurrentTasks?: number | undefined
}

export type ResolvedConfig = {
  stateDir: string
  workDir: string
  model?: string | undefined
  checkIntervalMs: number
  selfAwakeIntervalMs: number
  taskTimeout: number
  maxConcurrentTasks: number
}
