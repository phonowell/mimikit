import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

import { readJson, writeJson } from '../../fs/json.js'
import { ensureDir } from '../../fs/paths.js'
import { truncateText } from '../../shared/text.js'
import { newId } from '../../shared/utils.js'

import type {
  MemoryRefreshPayload,
  MemoryRefreshSubprocessResult,
} from './types.js'

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SUBPROCESS_ENTRY = fileURLToPath(new URL('./subprocess.ts', import.meta.url))
const LOCAL_TSX_BIN = join(
  PROJECT_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
)

const resolveTsxCommand = async (): Promise<string> => {
  try {
    await access(LOCAL_TSX_BIN)
    return LOCAL_TSX_BIN
  } catch {
    return 'tsx'
  }
}

const runSubprocess = async (params: {
  inputPath: string
  outputPath: string
}): Promise<void> => {
  const tsx = await resolveTsxCommand()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(tsx, [SUBPROCESS_ENTRY, params.inputPath, params.outputPath], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `memory_refresh_subprocess_failed:${code}:${truncateText(stderr, 400, { normalizeWhitespace: true })}`,
        ),
      )
    })
  })
}

const cleanupTempFiles = async (paths: string[]): Promise<void> => {
  await Promise.all(
    paths.map((path) => rm(path, { force: true }).catch(() => undefined)),
  )
}

export const spawnMemoryRefreshJob = async (params: {
  jobsDir: string
  payload: MemoryRefreshPayload
}): Promise<MemoryRefreshSubprocessResult> => {
  await ensureDir(params.jobsDir)
  const jobId = `memory-refresh-${newId()}`
  const inputPath = join(params.jobsDir, `${jobId}.input.json`)
  const outputPath = join(params.jobsDir, `${jobId}.output.json`)
  try {
    await writeJson(inputPath, params.payload)
    await runSubprocess({ inputPath, outputPath })
    const output = await readJson<MemoryRefreshSubprocessResult | null>(
      outputPath,
      null,
    )
    if (!output) throw new Error('memory_refresh_subprocess_empty_output')
    return output
  } finally {
    await cleanupTempFiles([inputPath, outputPath])
  }
}
