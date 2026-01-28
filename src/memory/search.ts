import { spawn } from 'node:child_process'
import readline from 'node:readline'

import { discoverMemoryPaths } from './files.js'

import type { Config } from '../config.js'

export type MemoryHit = {
  path: string
  line: number
  text: string
}

const normalizeQuery = (value: string, maxLen = 160): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLen) return normalized
  return normalized.slice(0, maxLen).trimEnd()
}

const runSearch = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<{ lines: string[]; exitCode: number }> => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })

  const lines: string[] = []
  const stderr: string[] = []

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  })
  rl.on('line', (line) => lines.push(line))
  child.stderr.on('data', (chunk: Buffer) =>
    stderr.push(chunk.toString('utf8')),
  )

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 0))
  })

  rl.close()

  if (exitCode > 1) {
    const errText = stderr.join('').trim()
    throw new Error(
      errText.length > 0 ? errText : `${command} failed with code ${exitCode}`,
    )
  }

  return { lines, exitCode }
}

const parseHit = (line: string): MemoryHit | null => {
  const match = line.match(/^(.*?):(\d+):(.*)$/)
  if (!match) return null
  const filePath = match[1]
  const lineNumber = match[2]
  const text = match[3] ?? ''
  if (!filePath || !lineNumber) return null
  return {
    path: filePath,
    line: Number.parseInt(lineNumber, 10),
    text,
  }
}

const trimHits = (
  hits: MemoryHit[],
  maxHits: number,
  maxChars: number,
): MemoryHit[] => {
  const results: MemoryHit[] = []
  let totalChars = 0
  for (const hit of hits) {
    const line = `${hit.path}:${hit.line} ${hit.text}`
    if (results.length >= maxHits) break
    if (totalChars + line.length > maxChars) break
    results.push(hit)
    totalChars += line.length + 1
  }
  return results
}

export const searchMemory = async (
  config: Config,
  query: string,
): Promise<MemoryHit[]> => {
  const normalized = normalizeQuery(query)
  if (!normalized) return []
  if (config.maxMemoryHits <= 0 || config.maxMemoryChars <= 0) return []

  const paths = await discoverMemoryPaths(
    config.workspaceRoot,
    config.memoryPaths,
  )
  if (paths.length === 0) return []

  const maxHits = Math.max(1, config.maxMemoryHits)
  const rgArgs = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '-F',
    '--max-count',
    String(maxHits),
    normalized,
    ...paths,
  ]

  try {
    const result = await runSearch('rg', rgArgs, config.workspaceRoot)
    const hits = result.lines
      .map(parseHit)
      .filter((hit): hit is MemoryHit => Boolean(hit))
    return trimHits(hits, maxHits, config.maxMemoryChars)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') throw error
  }

  const grepArgs = [
    '-R',
    '-nH',
    '-F',
    '-m',
    String(maxHits),
    normalized,
    ...paths,
  ]
  try {
    const result = await runSearch('grep', grepArgs, config.workspaceRoot)
    const hits = result.lines
      .map(parseHit)
      .filter((hit): hit is MemoryHit => Boolean(hit))
    return trimHits(hits, maxHits, config.maxMemoryChars)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return []
    throw error
  }
}
