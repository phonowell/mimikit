import { toSurfaceArtifactLink } from './artifact-link.js'
import { toDisplayPath, toStateDisplayPath } from './path-display.js'

import type { SurfaceArtifactLink } from './artifact-link.js'
import type {
  Task,
  TaskResult,
  TaskResultHandoffArtifact,
  TaskResultHandoffEvidence,
} from '../../foundation/types/index.js'

const toArtifactLabel = (path: string, workDir?: string): string => {
  const statePath = toStateDisplayPath(path)
  if (statePath) return statePath
  return toDisplayPath(path, workDir)
}

const toHandoffArtifactLink = (params: {
  path: string
  kind?: string | undefined
  note?: string | undefined
  workDir?: string | undefined
}): SurfaceArtifactLink | null =>
  toSurfaceArtifactLink({
    path: params.path,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.note ? { note: params.note } : {}),
    label: toArtifactLabel(params.path, params.workDir),
  })

const pushIfPresent = (
  target: SurfaceArtifactLink[],
  seen: Set<string>,
  next: SurfaceArtifactLink | null,
) => {
  if (!next) return
  const key = `${next.href}::${next.label}`
  if (seen.has(key)) return
  seen.add(key)
  target.push(next)
}

const appendHandoffArtifacts = (
  target: SurfaceArtifactLink[],
  seen: Set<string>,
  items: TaskResultHandoffArtifact[] | undefined,
  workDir?: string,
) => {
  for (const item of items ?? []) {
    pushIfPresent(
      target,
      seen,
      toHandoffArtifactLink({
        path: item.path,
        ...(item.kind ? { kind: item.kind } : {}),
        ...(item.note ? { note: item.note } : {}),
        ...(workDir ? { workDir } : {}),
      }),
    )
  }
}

const appendHandoffEvidence = (
  target: SurfaceArtifactLink[],
  seen: Set<string>,
  items: TaskResultHandoffEvidence[] | undefined,
  workDir?: string,
) => {
  for (const item of items ?? []) {
    if (item.type !== 'task_archive' && item.type !== 'file') continue
    pushIfPresent(
      target,
      seen,
      toHandoffArtifactLink({
        path: item.ref,
        kind: item.type,
        ...(item.note ? { note: item.note } : {}),
        ...(workDir ? { workDir } : {}),
      }),
    )
  }
}

export const buildTaskResultSurfaceArtifacts = (params: {
  task?: Task | undefined
  result: TaskResult
  workDir?: string | undefined
}): SurfaceArtifactLink[] | undefined => {
  const next: SurfaceArtifactLink[] = []
  const seen = new Set<string>()
  const archivePath =
    params.result.archivePath?.trim() ??
    params.task?.archivePath?.trim() ??
    params.task?.result?.archivePath?.trim()
  if (archivePath) {
    pushIfPresent(
      next,
      seen,
      toHandoffArtifactLink({
        path: archivePath,
        kind: 'task_archive',
        note: '任务归档',
        ...(params.workDir ? { workDir: params.workDir } : {}),
      }),
    )
  }
  appendHandoffArtifacts(
    next,
    seen,
    params.result.handoff?.artifacts,
    params.workDir,
  )
  appendHandoffEvidence(
    next,
    seen,
    params.result.handoff?.evidence,
    params.workDir,
  )
  return next.length > 0 ? next : undefined
}
