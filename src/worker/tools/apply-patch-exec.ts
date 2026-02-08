import { dirname } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import read from 'fire-keeper/read'
import remove from 'fire-keeper/remove'
import write from 'fire-keeper/write'

import { type Hunk, normalizePatchPath } from './apply-patch-parse.js'
import { applyUpdateHunk } from './apply-patch-update.js'
import { resolveToolPath } from './common.js'

import type { WorkerToolContext } from './common.js'

const ensureParentDir = (path: string): Promise<void> => mkdir(dirname(path))

export const applyPatchHunks = async (
  context: WorkerToolContext,
  hunks: Hunk[],
): Promise<{ added: string[]; modified: string[]; deleted: string[] }> => {
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  for (const hunk of hunks) {
    const targetPath = normalizePatchPath(hunk.path)
    const resolvedPath = resolveToolPath(context.workDir, targetPath)
    if (hunk.kind === 'add') {
      await ensureParentDir(resolvedPath)
      await write(resolvedPath, hunk.contents, { encoding: 'utf8' })
      added.push(targetPath)
      continue
    }
    if (hunk.kind === 'delete') {
      await remove(resolvedPath)
      deleted.push(targetPath)
      continue
    }
    const current = await read(resolvedPath, { raw: true })
    if (!current) throw new Error(`patch_update_target_not_found:${targetPath}`)
    const applied = await applyUpdateHunk(resolvedPath, hunk.chunks)
    if (hunk.movePath) {
      const moveTargetPath = normalizePatchPath(hunk.movePath)
      const moveResolvedPath = resolveToolPath(context.workDir, moveTargetPath)
      await ensureParentDir(moveResolvedPath)
      await write(moveResolvedPath, applied, { encoding: 'utf8' })
      await remove(resolvedPath)
      modified.push(moveTargetPath)
    } else {
      await write(resolvedPath, applied, { encoding: 'utf8' })
      modified.push(targetPath)
    }
  }
  return { added, modified, deleted }
}
