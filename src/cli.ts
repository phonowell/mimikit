import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from './config.js'
import { buildPaths } from './fs/paths.js'
import { createHttpServer } from './http/index.js'
import { loadCodexSettings } from './llm/openai.js'
import { setDefaultLogPath } from './log/safe.js'
import { Supervisor } from './supervisor/supervisor.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '8787' },
    'state-dir': { type: 'string', default: '.mimikit' },
    'work-dir': { type: 'string', default: '.' },
  },
})

const portValue = values.port
const stateDir = values['state-dir']
const workDir = values['work-dir']

const resolvedStateDir = resolve(stateDir)
const resolvedWorkDir = resolve(workDir)
setDefaultLogPath(buildPaths(resolvedStateDir).log)
await loadCodexSettings()

const parsePort = (value: string): string => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return String(num)
}

const port = parsePort(portValue)

const config = defaultConfig({
  stateDir: resolvedStateDir,
  workDir: resolvedWorkDir,
})

const envModel = process.env.MIMIKIT_MODEL?.trim()
if (envModel) config.manager.model = envModel
const envReasoning = process.env.MIMIKIT_REASONING_EFFORT?.trim()
if (envReasoning) {
  const allowed: ModelReasoningEffort[] = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]
  if (allowed.includes(envReasoning as ModelReasoningEffort))
    config.manager.modelReasoningEffort = envReasoning as ModelReasoningEffort
  else console.warn('[cli] invalid MIMIKIT_REASONING_EFFORT:', envReasoning)
}

console.log('[cli] config:', config)

const supervisor = new Supervisor(config)

await supervisor.start()
createHttpServer(supervisor, config, parseInt(port, 10))

const shutdown = (reason: string) => {
  console.log(`\n[cli] ${reason}`)
  supervisor.stop()
  process.exit(0)
}

process.on('SIGINT', () => {
  shutdown('shutting down...')
})

process.on('SIGTERM', () => {
  shutdown('received SIGTERM, shutting down...')
})
