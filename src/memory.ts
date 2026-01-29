import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

export type MemoryHit = {
  path: string
  line: number
  text: string
}

export type MemoryConfig = {
  workDir: string
  memoryPaths?: string[] | undefined
  maxHits?: number | undefined
  maxChars?: number | undefined
}

const DEFAULT_MEMORY_PATHS = ['memory', 'docs', '.mimikit/memory']

export const searchMemory = async (
  config: MemoryConfig,
  query: string,
): Promise<MemoryHit[]> => {
  const normalized = query.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (!normalized) return []

  const maxHits = config.maxHits ?? 10
  const maxChars = config.maxChars ?? 4000
  const paths = await discoverPaths(
    config.workDir,
    config.memoryPaths ?? DEFAULT_MEMORY_PATHS,
  )

  if (paths.length === 0) return []

  const args = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '-F',
    '--max-count',
    String(maxHits),
    '--',
    normalized,
    ...paths,
  ]

  try {
    const lines = await runRg(args, config.workDir)
    return trimHits(parseHits(lines), maxHits, maxChars)
  } catch {
    return []
  }
}

const discoverPaths = async (
  workDir: string,
  candidates: string[],
): Promise<string[]> => {
  const results: string[] = []
  for (const candidate of candidates) {
    const fullPath = join(workDir, candidate)
    try {
      const s = await stat(fullPath)
      if (s.isDirectory() || s.isFile()) results.push(fullPath)
    } catch {
      // ignore
    }
  }
  return results
}

const runRg = (args: string[], cwd: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const child = spawn('rg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const lines: string[] = []

    child.stdout.on('data', (data) => {
      lines.push(...data.toString().split('\n').filter(Boolean))
    })

    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(lines)
      else reject(new Error(`rg exited with ${code}`))
    })

    child.on('error', reject)
  })

const parseHits = (lines: string[]): MemoryHit[] => {
  const hits: MemoryHit[] = []
  for (const line of lines) {
    const match = line.match(/^(.*?):(\d+):(.*)$/)
    if (!match) continue
    const [, path, lineNum, text] = match
    if (!path || !lineNum) continue
    hits.push({ path, line: parseInt(lineNum, 10), text: text ?? '' })
  }
  return hits
}

const trimHits = (
  hits: MemoryHit[],
  maxHits: number,
  maxChars: number,
): MemoryHit[] => {
  const results: MemoryHit[] = []
  let totalChars = 0
  for (const hit of hits) {
    if (results.length >= maxHits) break
    const line = `${hit.path}:${hit.line} ${hit.text}`
    if (totalChars + line.length > maxChars) break
    results.push(hit)
    totalChars += line.length + 1
  }
  return results
}

export const formatMemoryHits = (hits: MemoryHit[]): string => {
  if (hits.length === 0) return ''
  const lines = ['## Relevant Memory']
  for (const hit of hits) lines.push(`- ${hit.path}:${hit.line} ${hit.text}`)

  return lines.join('\n')
}
