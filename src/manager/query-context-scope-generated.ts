import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { readErrorCode } from '../shared/error-code.js'

import { isWildcardQuery, toDisplayPath } from './query-context-scope-shared.js'
import {
  scoreQueryCandidate,
  sortByScoreTimeId,
  truncatePreview,
} from './query-context-score.js'
import { decodeUtf8Text } from './read-file-content.js'

import type { QueryLookupGeneratedIndexItem } from '../types/index.js'

type GeneratedFileCandidate = {
  absolutePath: string
  path: string
  size: number
  timeMs: number
}

const toIsoTime = (timeMs: number): string => new Date(timeMs).toISOString()

const isRecoverableFsError = (error: unknown): boolean => {
  const code = readErrorCode(error)
  return (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'EISDIR'
  )
}

const collectGeneratedFiles = async (
  workDir: string,
  walkMaxFiles: number,
): Promise<Array<{ absolutePath: string; path: string }>> => {
  const generatedDir = join(workDir, 'generated')
  const stack = [generatedDir]
  const files: Array<{ absolutePath: string; path: string }> = []
  while (stack.length > 0 && files.length < walkMaxFiles) {
    const currentDir = stack.pop()
    if (!currentDir) break
    const entries = await listFiles(currentDir)
    for (const entry of entries) {
      if (files.length >= walkMaxFiles) break
      const absolutePath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const path = toDisplayPath(absolutePath, workDir)
      if (!path || path === '.' || path.startsWith('..')) continue
      files.push({ absolutePath, path })
    }
  }
  return files
}

const readSnippet = async (
  absolutePath: string,
  maxReadBytes: number,
  maxItemChars: number,
): Promise<{ readable: boolean; snippet?: string }> => {
  try {
    const raw = await readFile(absolutePath)
    if (raw.byteLength === 0) return { readable: true }
    const clipped =
      raw.byteLength <= maxReadBytes ? raw : raw.subarray(0, maxReadBytes)
    const decoded = decodeUtf8Text(clipped)
    const snippet = truncatePreview(decoded, maxItemChars)
    return { readable: true, ...(snippet ? { snippet } : {}) }
  } catch (error) {
    if (error instanceof TypeError || isRecoverableFsError(error))
      return { readable: false }
    throw error
  }
}

export const queryGeneratedScope = async (params: {
  workDir: string
  query: string
  maxItemChars: number
  scanMaxFiles: number
  walkMaxFiles: number
  maxReadBytes: number
}): Promise<QueryLookupGeneratedIndexItem[]> => {
  const wildcard = isWildcardQuery(params.query)
  const discovered = await collectGeneratedFiles(
    params.workDir,
    params.walkMaxFiles,
  )
  const files: GeneratedFileCandidate[] = []
  for (const item of discovered) {
    try {
      const stats = await stat(item.absolutePath)
      if (!stats.isFile()) continue
      files.push({
        absolutePath: item.absolutePath,
        path: item.path,
        size: stats.size,
        timeMs: stats.mtimeMs,
      })
    } catch (error) {
      if (isRecoverableFsError(error)) continue
      throw error
    }
  }
  if (files.length === 0) return []

  const recentFiles = [...files]
    .sort((left, right) => right.timeMs - left.timeMs)
    .slice(0, Math.max(1, params.scanMaxFiles))
  const times = recentFiles.map((item) => item.timeMs)
  const oldestMs = times.length > 0 ? Math.min(...times) : 0
  const newestMs = times.length > 0 ? Math.max(...times) : 0

  const ranked: Array<
    QueryLookupGeneratedIndexItem & { id: string; timeMs: number }
  > = []
  for (const item of recentFiles) {
    const snippetResult = await readSnippet(
      item.absolutePath,
      params.maxReadBytes,
      params.maxItemChars,
    )
    if (!snippetResult.readable) continue
    const { snippet } = snippetResult
    const score = scoreQueryCandidate({
      query: params.query,
      isWildcard: wildcard,
      haystack: [item.path, snippet ?? ''].join('\n'),
      timeMs: item.timeMs,
      oldestMs,
      newestMs,
    })
    if (!wildcard && score <= 0) continue
    ranked.push({
      id: item.path,
      timeMs: item.timeMs,
      ref: `generated:${item.path}`,
      path: item.path,
      updatedAt: toIsoTime(item.timeMs),
      size: item.size,
      score,
      ...(snippet ? { snippet } : {}),
    })
  }
  return sortByScoreTimeId(ranked)
}
