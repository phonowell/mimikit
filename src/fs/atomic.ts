import { copyFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const writeFileAtomic = async (
  path: string,
  content: string,
  opts?: { backup?: boolean },
): Promise<void> => {
  const dir = dirname(path)
  const tmp = join(
    dir,
    `${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  )
  if (opts?.backup) {
    try {
      await copyFile(path, `${path}.bak`)
    } catch {
      // ignore missing source
    }
  }
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}
