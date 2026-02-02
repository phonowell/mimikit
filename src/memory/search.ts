import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import bm25 from 'wink-bm25-text-search'

import { safe } from '../log/safe.js'

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
    const found = await safe(
      'rgFallback: runRg',
      () => runRg(params.tokens, group),
      {
        fallback: [],
        meta: { files: group.length, tokens: params.tokens.length },
      },
    )
    for (const file of found) matches.add(file)
    if (matches.size >= params.limit) break
  }
  const hits: MemoryHit[] = []
  for (const file of matches) {
    const content = await safe(
      'rgFallback: readFile',
      () => readFile(file, 'utf8'),
      { fallback: null, meta: { file }, ignoreCodes: ['ENOENT'] },
    )
    if (content === null) continue
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
    const body = await safe(
      'searchMemory: readFile',
      () => readFile(entry.path, 'utf8'),
      { fallback: null, meta: { file: entry.path }, ignoreCodes: ['ENOENT'] },
    )
    if (body === null) continue
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
      const content = await safe(
        'searchMemory: readFile (fallback)',
        () => readFile(entry.path, 'utf8'),
        {
          fallback: null,
          meta: { file: entry.path },
          ignoreCodes: ['ENOENT'],
        },
      )
      if (content === null) continue
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
    const content = await safe(
      'searchMemory: readFile (result)',
      () => readFile(entry.path, 'utf8'),
      { fallback: '', meta: { file: entry.path }, ignoreCodes: ['ENOENT'] },
    )
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
    const content = await safe(
      'searchMemory: readFile (final fallback)',
      () => readFile(entry.path, 'utf8'),
      { fallback: null, meta: { file: entry.path }, ignoreCodes: ['ENOENT'] },
    )
    if (content === null) continue
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
