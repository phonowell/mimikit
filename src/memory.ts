import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { searchBm25 } from './memory/bm25.js'
import { listSearchFiles } from './memory/index.js'
import { expandKeywords } from './memory/query-expand.js'

import type { Dirent } from 'node:fs'

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

const MAX_HIT_TEXT_CHARS = 160

export const searchMemory = async (
  config: MemoryConfig,
  keywords: string[],
): Promise<MemoryHit[]> => {
  if (keywords.length === 0) return []

  const maxHits = config.maxHits ?? 10
  const maxChars = config.maxChars ?? 1200
  const expanded = expandKeywords(keywords, { maxTerms: 12 })
  if (expanded.length === 0) return []
  const paths = await resolveSearchFiles(config)

  if (paths.length === 0) return []

  const query = expanded.join(' ')

  if (!config.memoryPaths || config.memoryPaths.length === 0) {
    try {
      const bm25Hits = await searchBm25({
        workDir: config.workDir,
        query,
        limit: maxHits * 4,
      })
      if (bm25Hits.length > 0) {
        const mapped = bm25Hits.map((hit) => ({
          path: hit.path,
          line: hit.lineStart,
          text: firstLine(hit.text),
        }))
        return trimHits(mapped, maxHits, maxChars)
      }
    } catch {
      // fall back to rg
    }
  }

  const args = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '--max-count',
    String(maxHits),
    ...expanded.flatMap((kw) => ['-e', kw]),
    '--',
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

const walkMarkdown = async (dir: string): Promise<string[]> => {
  const results: string[] = []
  let entries: Dirent[] = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkMarkdown(full)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) results.push(full)
  }
  return results
}

const resolveSearchFiles = async (config: MemoryConfig): Promise<string[]> => {
  if (config.memoryPaths && config.memoryPaths.length > 0) {
    const roots = await discoverPaths(config.workDir, config.memoryPaths)
    const files: string[] = []
    for (const root of roots) {
      try {
        const s = await stat(root)
        if (s.isDirectory()) files.push(...(await walkMarkdown(root)))
        else if (s.isFile()) files.push(root)
      } catch {
        // ignore
      }
    }
    return files
  }
  const entries = await listSearchFiles({ workDir: config.workDir })
  return entries.map((entry) => entry.path)
}

const firstLine = (text: string): string => {
  const line = text.split('\n').find((item) => item.trim())
  return line?.trim() ?? text
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

const truncateLine = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 3)}...`
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
    const trimmedText = truncateLine(hit.text, MAX_HIT_TEXT_CHARS)
    const line = `${hit.path}:${hit.line} ${trimmedText}`
    if (totalChars + line.length > maxChars) break
    results.push({ ...hit, text: trimmedText })
    totalChars += line.length + 1
  }
  return results
}

export const formatMemoryHits = (hits: MemoryHit[]): string => {
  if (hits.length === 0) return ''
  const lines = ['## Mem']
  for (const hit of hits) lines.push(`- ${hit.path}:${hit.line} ${hit.text}`)

  return lines.join('\n')
}
