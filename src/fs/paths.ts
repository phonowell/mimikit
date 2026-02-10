import { access, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'

import { safe } from '../log/safe.js'

import type { Dirent } from 'node:fs'

export type StatePaths = {
  root: string
  inputsDir: string
  resultsDir: string
  tasksDir: string
  history: string
  log: string
  inputsPackets: string
  inputsState: string
  resultsPackets: string
  resultsState: string
  tasksEvents: string
  feedback: string
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
    history: join(root, 'history.jsonl'),
    log: join(root, 'log.jsonl'),
    inputsPackets: join(inputsDir, 'packets.jsonl'),
    inputsState: join(inputsDir, 'state.json'),
    resultsPackets: join(resultsDir, 'packets.jsonl'),
    resultsState: join(resultsDir, 'state.json'),
    tasksEvents: join(tasksDir, 'tasks.jsonl'),
    feedback: join(root, 'feedback.md'),
    userProfile: join(root, 'user_profile.md'),
    agentPersona: join(root, 'agent_persona.md'),
    agentPersonaVersionsDir,
  }
}

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path)
}

const ensureFile = async (
  path: string,
  initialContent: string,
): Promise<void> => {
  try {
    await access(path)
  } catch {
    await writeFile(path, initialContent, 'utf8')
  }
}

export const ensureStateDirs = async (paths: StatePaths): Promise<void> => {
  await ensureDir(paths.root)
  await ensureDir(paths.inputsDir)
  await ensureDir(paths.resultsDir)
  await ensureDir(paths.tasksDir)
  await ensureDir(paths.agentPersonaVersionsDir)
  await ensureDir(join(paths.root, 'reporting'))
  await ensureDir(join(paths.root, 'reports'))
  await ensureDir(join(paths.root, 'reports', 'daily'))
  await ensureFile(paths.feedback, '# Feedback\n\n')
  await ensureFile(paths.userProfile, '# User Profile\n\n')
  await ensureFile(paths.agentPersona, '# Agent Persona\n\n')
}

export const listFiles = (dir: string): Promise<Dirent[]> =>
  safe('listFiles: readdir', () => readdir(dir, { withFileTypes: true }), {
    fallback: [],
    meta: { dir },
    ignoreCodes: ['ENOENT'],
  })
