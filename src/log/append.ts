import { createReadStream, createWriteStream } from 'node:fs'
import {
  appendFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

import { ensureDir } from '../fs/ensure.js'
import { nowIso } from '../time.js'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_DAYS = 30

const dateStamp = (iso: string): string => iso.slice(0, 10)

const compressLog = async (path: string): Promise<void> => {
  const gzPath = `${path}.gz`
  try {
    await pipeline(
      createReadStream(path),
      createGzip(),
      createWriteStream(gzPath),
    )
    await unlink(path)
  } catch (error) {
    console.error('[log] compress failed', error)
  }
}

const pruneLogs = async (dir: string): Promise<void> => {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return
    console.error('[log] pruneLogs readdir failed', error)
    return
  }
  const logs: Array<{ path: string; mtime: number; size: number }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith('log.')) continue
    if (!entry.name.endsWith('.jsonl') && !entry.name.endsWith('.jsonl.gz'))
      continue
    const fullPath = join(dir, entry.name)
    try {
      const info = await stat(fullPath)
      logs.push({ path: fullPath, mtime: info.mtimeMs, size: info.size })
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (code !== 'ENOENT') console.error('[log] pruneLogs stat failed', error)
    }
  }
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000
  const remaining: Array<{ path: string; mtime: number; size: number }> = []
  for (const log of logs) {
    if (log.mtime < cutoff) {
      try {
        await unlink(log.path)
      } catch (error) {
        const code =
          typeof error === 'object' && error && 'code' in error
            ? String((error as { code?: string }).code)
            : undefined
        if (code !== 'ENOENT')
          console.error('[log] pruneLogs unlink failed', error)
      }
      continue
    }
    remaining.push(log)
  }

  remaining.sort((a, b) => a.mtime - b.mtime)
  let total = remaining.reduce((sum, item) => sum + item.size, 0)
  for (const item of remaining) {
    if (total <= MAX_TOTAL_BYTES) break
    try {
      await unlink(item.path)
      total -= item.size
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (code !== 'ENOENT')
        console.error('[log] pruneLogs unlink failed', error)
    }
  }
}

export const appendLog = async (
  path: string,
  entry: Record<string, unknown>,
): Promise<void> => {
  await ensureDir(dirname(path))
  const line = `${JSON.stringify({ timestamp: nowIso(), ...entry })}\n`
  await appendFile(path, line, 'utf8')
}

export const rotateLogIfNeeded = async (path: string): Promise<void> => {
  let size = 0
  let existingDate = ''
  try {
    const info = await stat(path)
    size = info.size
    existingDate = dateStamp(info.mtime.toISOString())
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return
    console.error('[log] rotateLogIfNeeded stat failed', error)
    throw error
  }
  const today = dateStamp(nowIso())
  if (size < MAX_BYTES && existingDate === today) return
  const base = join(dirname(path), `log.${today}.jsonl`)
  let target = base
  let idx = 1
  for (;;) {
    try {
      await stat(target)
      target = join(dirname(path), `log.${today}.${idx}.jsonl`)
      idx += 1
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (code === 'ENOENT') break
      console.error('[log] rotateLogIfNeeded stat failed', error)
      throw error
    }
  }
  await rename(path, target)
  await writeFile(path, '', 'utf8')
  await compressLog(target)
  await pruneLogs(dirname(path))
}
