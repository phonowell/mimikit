import { access, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'

import { safe } from '../log/safe.js'

import type { Dirent } from 'node:fs'

export type StatePaths = {
  root: string
  inputsDir: string
  resultsDir: string
  wakesDir: string
  tasksDir: string
  history: string
  log: string
  inputsPackets: string
  resultsPackets: string
  wakesPackets: string
  tasksEvents: string
  userProfile: string
  agentPersona: string
  agentPersonaVersionsDir: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  const inputsDir = join(root, 'inputs')
  const resultsDir = join(root, 'results')
  const wakesDir = join(root, 'wakes')
  const tasksDir = join(root, 'tasks')
  const agentPersonaVersionsDir = join(root, 'agent_persona_versions')
  return {
    root,
    inputsDir,
    resultsDir,
    wakesDir,
    tasksDir,
    history: join(root, 'history'),
    log: join(root, 'log.jsonl'),
    inputsPackets: join(inputsDir, 'packets.jsonl'),
    resultsPackets: join(resultsDir, 'packets.jsonl'),
    wakesPackets: join(wakesDir, 'packets.jsonl'),
    tasksEvents: join(tasksDir, 'tasks.jsonl'),
    userProfile: join(root, 'user_profile.md'),
    agentPersona: join(root, 'agent_persona.md'),
    agentPersonaVersionsDir,
  }
}

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { echo: false })
}

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  const { code } = error as { code?: unknown }
  return typeof code === 'string' ? code : undefined
}

export const ensureFile = async (
  path: string,
  initialContent: string,
): Promise<void> => {
  await ensureDir(dirname(path))
  try {
    await access(path)
  } catch (error) {
    const code = getErrorCode(error)
    if (code && code !== 'ENOENT') throw error
    await writeFile(path, initialContent, 'utf8')
  }
}

export const listFiles = (dir: string): Promise<Dirent[]> =>
  safe('listFiles: readdir', () => readdir(dir, { withFileTypes: true }), {
    fallback: [],
    meta: { dir },
    ignoreCodes: ['ENOENT'],
  })
