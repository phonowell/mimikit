import { readFile, stat } from 'node:fs/promises'

import bm25 from 'wink-bm25-text-search'

import { listSearchFiles, type MemoryFileEntry } from './index.js'

type Chunk = {
  id: number
  path: string
  lineStart: number
  lineEnd: number
  text: string
}

type IndexSnapshot = {
  key: string
  chunks: Chunk[]
  engine: ReturnType<typeof bm25>
  fileCount: number
}

const CHUNK_MAX_CHARS = 1200
const CHUNK_OVERLAP_CHARS = 200

const TOKEN_PATTERN = /[a-z0-9_]{2,}|[\u4e00-\u9fff]+/gi

let cachedIndex: IndexSnapshot | null = null

const tokenize = (text: string): string[] => {
  const tokens: string[] = []
  const matches = text.matchAll(TOKEN_PATTERN)
  for (const match of matches) {
    const raw = match[0]
    if (!raw) continue
    if (/^[a-z0-9_]+$/i.test(raw)) {
      tokens.push(raw.toLowerCase())
      continue
    }
    if (/[\u4e00-\u9fff]/.test(raw)) {
      if (raw.length <= 2) {
        tokens.push(raw)
        continue
      }
      for (let i = 0; i < raw.length - 1; i += 1)
        tokens.push(raw.slice(i, i + 2))
    }
  }
  return tokens
}

const buildEngine = () => {
  const engine = bm25()
  engine.defineConfig({ fldWeights: { body: 1 } })
  const prep = [tokenize]
  engine.definePrepTasks(prep, 'body')
  engine.definePrepTasks(prep)
  return engine
}

const chunkMarkdown = (
  content: string,
  path: string,
  startId: number,
): Chunk[] => {
  const lines = content.split('\n')
  const chunks: Chunk[] = []
  let current: Array<{ line: string; lineNo: number }> = []
  let currentChars = 0
  let id = startId

  const flush = () => {
    if (current.length === 0) return
    const first = current[0]
    const last = current[current.length - 1]
    if (!first || !last) return
    const text = current.map((entry) => entry.line).join('\n')
    chunks.push({
      id,
      path,
      lineStart: first.lineNo,
      lineEnd: last.lineNo,
      text,
    })
    id += 1
  }

  const carryOverlap = () => {
    if (current.length === 0) {
      current = []
      currentChars = 0
      return
    }
    let acc = 0
    const kept: Array<{ line: string; lineNo: number }> = []
    for (let i = current.length - 1; i >= 0; i -= 1) {
      const entry = current[i]
      if (!entry) continue
      acc += entry.line.length + 1
      kept.unshift(entry)
      if (acc >= CHUNK_OVERLAP_CHARS) break
    }
    current = kept
    currentChars = kept.reduce((sum, entry) => sum + entry.line.length + 1, 0)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const lineNo = i + 1
    const lineChars = line.length + 1
    if (currentChars + lineChars > CHUNK_MAX_CHARS && current.length > 0) {
      flush()
      carryOverlap()
    }
    current.push({ line, lineNo })
    currentChars += lineChars
  }

  flush()
  return chunks
}

const buildIndexKey = async (files: MemoryFileEntry[]): Promise<string> => {
  const parts: string[] = []
  for (const file of files) {
    try {
      const s = await stat(file.path)
      parts.push(`${file.path}:${s.mtimeMs}:${s.size}`)
    } catch {
      parts.push(`${file.path}:missing`)
    }
  }
  return parts.join('|')
}

const buildIndex = async (workDir: string): Promise<IndexSnapshot | null> => {
  const files = await listSearchFiles({ workDir })
  if (files.length === 0) return null
  const key = await buildIndexKey(files)
  if (cachedIndex?.key === key) return cachedIndex

  const engine = buildEngine()
  const chunks: Chunk[] = []
  let nextId = 0
  for (const file of files) {
    try {
      const content = await readFile(file.path, 'utf-8')
      const fileChunks = chunkMarkdown(content, file.path, nextId)
      for (const chunk of fileChunks) {
        engine.addDoc({ body: chunk.text, path: chunk.path }, chunk.id)
        chunks.push(chunk)
        nextId = Math.max(nextId, chunk.id + 1)
      }
    } catch {
      // skip unreadable
    }
  }
  engine.consolidate()
  const snapshot: IndexSnapshot = {
    key,
    chunks,
    engine,
    fileCount: files.length,
  }
  cachedIndex = snapshot
  return snapshot
}

export const searchBm25 = async (params: {
  workDir: string
  query: string
  limit: number
}): Promise<Array<Chunk & { score: number }>> => {
  const index = await buildIndex(params.workDir)
  if (!index) return []
  const results = index.engine.search(params.query, params.limit) as Array<
    { id: number; score: number } | number
  >
  const hits: Array<Chunk & { score: number }> = []
  for (const result of results) {
    if (typeof result === 'number') {
      const chunk = index.chunks.find((item) => item.id === result)
      if (!chunk) continue
      hits.push({ ...chunk, score: 1 })
      continue
    }
    const chunk = index.chunks.find((item) => item.id === result.id)
    if (!chunk) continue
    hits.push({ ...chunk, score: result.score })
  }
  return hits
}

export const getBm25Stats = async (
  workDir: string,
): Promise<{
  fileCount: number
  chunkCount: number
}> => {
  const index = await buildIndex(workDir)
  if (!index) return { fileCount: 0, chunkCount: 0 }
  return { fileCount: index.fileCount, chunkCount: index.chunks.length }
}
