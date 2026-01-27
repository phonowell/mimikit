import fs from 'node:fs/promises'
import path from 'node:path'

const pathExists = async (targetPath: string): Promise<boolean> => {
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
): Promise<string[]> => {
  const candidates =
    configuredPaths.length > 0
      ? configuredPaths
      : [
          path.join(workspaceRoot, 'MEMORY.md'),
          path.join(workspaceRoot, 'memory'),
        ]

  const results: string[] = []
  for (const candidate of candidates)
    if (await pathExists(candidate)) results.push(candidate)

  return results
}
