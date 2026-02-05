import { runBeadsJson } from './cli.js'
import { resolveBeadsConfig } from './config.js'
import { extractIssues } from './normalize.js'

import type { BeadsCommandResult, BeadsContext } from './types.js'

export const loadBeadsContext = async (params: {
  workDir: string
  lastResults?: BeadsCommandResult[]
}): Promise<BeadsContext | null> => {
  const config = await resolveBeadsConfig(params.workDir)
  if (!config) return null
  const base: BeadsContext = {
    enabled: true,
    available: false,
    mode: config.mode,
    worktree: config.worktree,
    noDaemon: config.noDaemon,
    ready: [],
    lastResults: params.lastResults ?? [],
  }
  try {
    const ready = await runBeadsJson(config, [
      'ready',
      '--limit',
      String(config.readyLimit),
    ])
    return {
      ...base,
      available: true,
      ready: extractIssues(ready),
    }
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
