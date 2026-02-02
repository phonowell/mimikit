import { join } from 'node:path'

export type StatePaths = {
  root: string
  userInputs: string
  tellerNotices: string
  thinkerState: string
  history: string
  agentQueue: string
  agentResults: string
  log: string
  llmDir: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  return {
    root,
    userInputs: join(root, 'user-inputs.jsonl'),
    tellerNotices: join(root, 'teller-notices.jsonl'),
    thinkerState: join(root, 'thinker-state.json'),
    history: join(root, 'history.jsonl'),
    agentQueue: join(root, 'agent-queue'),
    agentResults: join(root, 'agent-results'),
    log: join(root, 'log.jsonl'),
    llmDir: join(root, 'llm'),
  }
}
