import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { readErrorCode } from '../../foundation/shared/error-code.js'
import { safe } from '../log/safe.js'

import type { Dirent } from 'node:fs'

export type StatePaths = {
  root: string
  inputsDir: string
  resultsDir: string
  tasksDir: string
  specsDir: string
  memoryDir: string
  runtimeDir: string
  usageDir: string
  history: string
  log: string
  logReadable: string
  inputsPackets: string
  resultsPackets: string
  tasksEvents: string
  memoryFile: string
  runtimeLease: string
  runtimeChildren: string
  usageLedger: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  const inputsDir = join(root, 'inputs')
  const resultsDir = join(root, 'results')
  const tasksDir = join(root, 'tasks')
  const specsDir = join(root, 'specs')
  const memoryDir = join(root, 'memory')
  const runtimeDir = join(root, 'runtime')
  const usageDir = join(root, 'usage')
  return {
    root,
    inputsDir,
    resultsDir,
    tasksDir,
    specsDir,
    memoryDir,
    runtimeDir,
    usageDir,
    history: join(root, 'history'),
    log: join(root, 'log.jsonl'),
    logReadable: join(root, 'log.jsonl.txt'),
    inputsPackets: join(inputsDir, 'packets.jsonl'),
    resultsPackets: join(resultsDir, 'packets.jsonl'),
    tasksEvents: join(tasksDir, 'tasks.jsonl'),
    memoryFile: join(memoryDir, 'MEMORY.md'),
    runtimeLease: join(runtimeDir, 'lease.json'),
    runtimeChildren: join(runtimeDir, 'children.json'),
    usageLedger: join(usageDir, 'ledger.jsonl'),
  }
}

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true })
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
