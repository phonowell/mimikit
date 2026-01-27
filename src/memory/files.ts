import fs from 'node:fs/promises'
import path from 'node:path'

export const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.stat(targetPath)
    return true
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return false
    throw error
  }
}

export const discoverMemoryPaths = async (
  workspaceRoot: string,
  configuredPaths: string[],
  extraPaths: string[] = [],
): Promise<string[]> => {
  const candidates =
    configuredPaths.length > 0
      ? configuredPaths
      : [
          path.join(workspaceRoot, 'MEMORY.md'),
          path.join(workspaceRoot, 'memory'),
        ]

  const results: string[] = []
  const seen = new Set<string>()
  for (const candidate of [...candidates, ...extraPaths]) {
    if (seen.has(candidate)) continue
    if (await pathExists(candidate)) {
      seen.add(candidate)
      results.push(candidate)
    }
  }

  return results
}
