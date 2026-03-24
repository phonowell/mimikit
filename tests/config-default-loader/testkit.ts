import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach } from 'vitest'

const tempDirs: string[] = []

export const writeTempConfig = async (source: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-config-loader-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.toml')
  await writeFile(path, source, 'utf8')
  return path
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})
