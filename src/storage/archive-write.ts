import { join } from 'node:path'

import write from 'fire-keeper/write'

import { ensureDir } from '../fs/paths.js'

import { dateStamp } from './archive-format.js'

type WriteDatedArchiveFileParams = {
  stateDir: string
  archiveSubDir: string
  timestamp: string
  filename: string
  content: string
  resolvePath?: (path: string) => Promise<string>
}

export const writeDatedArchiveFile = async (
  params: WriteDatedArchiveFileParams,
): Promise<string> => {
  const dateDir = dateStamp(params.timestamp)
  const dir = join(params.stateDir, params.archiveSubDir, dateDir)
  await ensureDir(dir)
  const basePath = join(dir, params.filename)
  const targetPath = params.resolvePath
    ? await params.resolvePath(basePath)
    : basePath
  await write(targetPath, params.content, { encoding: 'utf8' }, { echo: false })
  return targetPath
}
