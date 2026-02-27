import { access, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'

import { safe } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'

import type { Dirent } from 'node:fs'

export type StatePaths = {
  root: string
  inputsDir: string
  resultsDir: string
  tasksDir: string
  history: string
  log: string
  inputsPackets: string
  resultsPackets: string
  tasksEvents: string
  userProfile: string
  agentPersona: string
  agentPersonaVersionsDir: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  const inputsDir = join(root, 'inputs')
  const resultsDir = join(root, 'results')
  const tasksDir = join(root, 'tasks')
  const agentPersonaVersionsDir = join(root, 'agent_persona_versions')
  return {
    root,
    inputsDir,
    resultsDir,
    tasksDir,
    history: join(root, 'history'),
    log: join(root, 'log.jsonl'),
    inputsPackets: join(inputsDir, 'packets.jsonl'),
    resultsPackets: join(resultsDir, 'packets.jsonl'),
    tasksEvents: join(tasksDir, 'tasks.jsonl'),
    userProfile: join(root, 'user_profile.md'),
    agentPersona: join(root, 'agent_persona.md'),
    agentPersonaVersionsDir,
  }
}

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { echo: false })
}

export const ensureFile = async (
  path: string,
  initialContent: string,
): Promise<void> => {
  await ensureDir(dirname(path))
  try {
    await access(path)
  } catch (error) {
    const code = readErrorCode(error)
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
