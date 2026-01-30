import { spawn } from 'node:child_process'

import type { MemoryHit } from './types.js'

const MAX_HIT_TEXT_CHARS = 160

export const firstLine = (text: string): string => {
  const line = text.split('\n').find((item) => item.trim())
  return line?.trim() ?? text
}

export const runRg = (args: string[], cwd: string): Promise<string[]> =>
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

export const parseHits = (lines: string[]): MemoryHit[] => {
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

export const trimHits = (
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
