import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import bm25 from 'wink-bm25-text-search'

import { listMemoryFiles } from './files.js'

export type MemoryHit = { source: string; content: string; score: number }

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi)
    ?.map((t) => t.toLowerCase()) ?? []

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

const runRg = (patterns: string[], files: string[]): Promise<string[]> =>
  new Promise((resolve, reject) => {
    if (patterns.length === 0 || files.length === 0) {
      resolve([])
      return
    }
    const args = ['--files-with-matches', '--fixed-strings', '--no-messages']
    for (const pattern of patterns) args.push('-e', pattern)
    args.push('--', ...files)
    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code && code > 1) {
        reject(new Error(stderr || `rg exited with code ${code}`))
        return
      }
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      resolve(lines)
    })
  })

const rgFallback = async (params: {
  files: string[]
  tokens: string[]
  limit: number
}): Promise<MemoryHit[]> => {
  const matches = new Set<string>()
  for (const group of chunk(params.files, 80)) {
    try {
      const found = await runRg(params.tokens, group)
      for (const file of found) matches.add(file)
    } catch {
      // ignore rg failure, fallback handled later
    }
    if (matches.size >= params.limit) break
  }
  const hits: MemoryHit[] = []
  for (const file of matches) {
    let content = ''
    try {
      content = await readFile(file, 'utf8')
    } catch {
      continue
    }
    hits.push({ source: file, content: content.slice(0, 300), score: 0.1 })
    if (hits.length >= params.limit) break
  }
  return hits
}

export const searchMemory = async (params: {
  stateDir: string
  query: string
  limit: number
  k1: number
  b: number
  minScore: number
}): Promise<MemoryHit[]> => {
  const files = await listMemoryFiles({ stateDir: params.stateDir })
  if (params.limit <= 0) return []
  const tokens = tokenize(params.query)
  if (tokens.length === 0) return []
  if (files.length === 0) return []
  const engine = bm25()
  engine.defineConfig({
    fldWeights: { body: 1 },
    bm25Params: { k1: params.k1, b: params.b },
  })
  engine.definePrepTasks([tokenize], 'body')
  engine.definePrepTasks([tokenize])

  let docsAdded = 0
  for (let i = 0; i < files.length; i += 1) {
    const entry = files[i]
    if (!entry) continue
    let body = ''
    try {
      body = await readFile(entry.path, 'utf8')
    } catch {
      continue
    }
    engine.addDoc({ body }, i)
    docsAdded += 1
  }
  if (docsAdded === 0) {
    const rgHits = await rgFallback({
      files: files.map((f) => f.path),
      tokens,
      limit: params.limit,
    })
    if (rgHits.length > 0) return rgHits
    const fallback: MemoryHit[] = []
    for (const entry of files) {
      let content = ''
      try {
        content = await readFile(entry.path, 'utf8')
      } catch {
        continue
      }
      const found = tokens.some((t) => content.toLowerCase().includes(t))
      if (!found) continue
      fallback.push({
        source: entry.path,
        content: content.slice(0, 300),
        score: 0.1,
      })
      if (fallback.length >= params.limit) break
    }
    return fallback
  }
  engine.consolidate()
  const results = engine.search(
    params.query,
    Math.max(1, params.limit * 2),
  ) as Array<{ id: number; score: number } | number>

  const hits: MemoryHit[] = []
  for (const result of results) {
    const entryId = typeof result === 'number' ? result : result.id
    const score = typeof result === 'number' ? 1 : result.score
    const entry = files[entryId]
    if (!entry || score < params.minScore) continue
    let content = ''
    try {
      content = await readFile(entry.path, 'utf8')
    } catch {
      content = ''
    }
    hits.push({ source: entry.path, content: content.slice(0, 300), score })
    if (hits.length >= params.limit) break
  }
  if (hits.length > 0) return hits

  const rgHits = await rgFallback({
    files: files.map((f) => f.path),
    tokens,
    limit: params.limit,
  })
  if (rgHits.length > 0) return rgHits

  const fallback: MemoryHit[] = []
  for (const entry of files) {
    let content = ''
    try {
      content = await readFile(entry.path, 'utf8')
    } catch {
      continue
    }
    const found = tokens.some((t) => content.toLowerCase().includes(t))
    if (!found) continue
    fallback.push({
      source: entry.path,
      content: content.slice(0, 300),
      score: 0.1,
    })
    if (fallback.length >= params.limit) break
  }
  return fallback
}
