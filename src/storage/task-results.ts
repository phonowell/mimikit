import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { safe } from '../log/safe.js'

import { listJsonPaths } from './dir.js'

import type { TaskResult } from '../types/tasks.js'

const resultPath = (dir: string, id: string): string => join(dir, `${id}.json`)

export const writeTaskResult = async (
  dir: string,
  result: TaskResult,
): Promise<void> => {
  const path = resultPath(dir, result.taskId)
  await writeJson(path, result)
}

export const listTaskResults = async (dir: string): Promise<TaskResult[]> => {
  const paths = await listJsonPaths(dir)
  if (paths.length === 0) return []
  const items = await Promise.all(
    paths.map(async (path) => {
      const result = await safe(
        'listTaskResults: readJson',
        () => readJson<TaskResult | null>(path, null),
        { fallback: null, meta: { path } },
      )
      return result
    }),
  )
  return items.filter((result): result is TaskResult => Boolean(result))
}

export const takeTaskResults = async (dir: string): Promise<TaskResult[]> => {
  const paths = await listJsonPaths(dir)
  if (paths.length === 0) return []
  const results: TaskResult[] = []
  for (const path of paths) {
    const result = await safe(
      'takeTaskResults: readJson',
      () => readJson<TaskResult | null>(path, null),
      { fallback: null, meta: { path } },
    )
    if (result) results.push(result)
    await safe(
      'takeTaskResults: unlink',
      () => import('node:fs/promises').then((fs) => fs.unlink(path)),
      { fallback: undefined, meta: { path }, ignoreCodes: ['ENOENT'] },
    )
  }
  return results
}
