export type BeadsMode = 'auto' | 'on' | 'off'

export type BeadsIssueSummary = {
  id: string
  title: string
  status?: string
  priority?: number
  issueType?: string
  labels?: string[]
  assignee?: string
  updatedAt?: string
}

export type BeadsCommandResult = {
  action: string
  ok: boolean
  issueId?: string
  output?: unknown
  error?: string
}

export type BeadsContext = {
  enabled: boolean
  available: boolean
  mode: BeadsMode
  worktree: boolean
  noDaemon: boolean
  ready: BeadsIssueSummary[]
  lastResults: BeadsCommandResult[]
  error?: string
}

export type BeadsCommand = {
  action: string
  attrs: Record<string, string>
  content?: string
}

export type BeadsConfig = {
  workDir: string
  mode: BeadsMode
  bin: string
  extraArgs: string[]
  readyLimit: number
  worktree: boolean
  noDaemon: boolean
}
