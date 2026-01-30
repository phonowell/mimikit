import { spawn } from 'node:child_process'

import type { MemoryHit } from './types.js'

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

export const trimHits = (hits: MemoryHit[], maxHits: number): MemoryHit[] =>
  hits.slice(0, maxHits)
