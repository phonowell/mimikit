import { readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'

import { safe } from '../log/safe.js'

const toPosix = (value: string): string => value.split(sep).join('/')

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const globToRegex = (pattern: string): RegExp => {
  let out = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i] ?? ''
    if (ch === '*') {
      const next = pattern[i + 1] ?? ''
      if (next === '*') {
        out += '.*'
        i += 2
        continue
      }
      out += '[^/]*'
      i += 1
      continue
    }
    if (ch === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    out += escapeRegExp(ch)
    i += 1
  }
  return new RegExp(`^${out}$`)
}

const walkFiles = async (root: string): Promise<string[]> => {
  const results: string[] = []
  const entries = await safe(
    'walkFiles: readdir',
    () => readdir(root, { withFileTypes: true }),
    { fallback: [], meta: { root }, ignoreCodes: ['ENOENT'] },
  )
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(full)))
      continue
    }
    if (entry.isFile()) results.push(full)
  }
  return results
}

export const globMtime = async (
  root: string,
  pattern: string,
): Promise<number | null> => {
  const regex = globToRegex(toPosix(pattern))
  const files = await walkFiles(root)
  let latest: number | null = null
  for (const file of files) {
    const rel = toPosix(file.slice(root.length + 1))
    if (!regex.test(rel)) continue
    const info = await safe('globMtime: stat', () => stat(file), {
      fallback: null,
      meta: { file },
      ignoreCodes: ['ENOENT'],
    })
    if (!info) continue
    if (!latest || info.mtimeMs > latest) latest = info.mtimeMs
  }
  return latest
}

export const globExists = async (
  root: string,
  pattern: string,
): Promise<boolean> => {
  const regex = globToRegex(toPosix(pattern))
  const files = await walkFiles(root)
  for (const file of files) {
    const rel = toPosix(file.slice(root.length + 1))
    if (regex.test(rel)) return true
  }
  return false
}
