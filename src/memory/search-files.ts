import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { listSearchFiles } from './index.js'

import type { MemoryConfig } from './types.js'
import type { Dirent } from 'node:fs'

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

export const resolveSearchFiles = async (
  config: MemoryConfig,
): Promise<string[]> => {
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
