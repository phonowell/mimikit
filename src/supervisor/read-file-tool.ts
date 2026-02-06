import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  DEFAULT_ALLOWED_FILE_EXTENSIONS,
  isPathAllowedByExtension,
} from './read-file-whitelist.js'

export type ReadFileToolParams = {
  path: string
  start?: number
  limit?: number
}

export type ReadFileToolConfig = {
  baseDir?: string
  defaultLines: number
  maxLines: number
  maxBytes: number
  allowedExtensions?: ReadonlySet<string>
}

type ReadFileToolOk = {
  ok: true
  path: string
  start: number
  end: number
  totalLines: number
  truncated: boolean
  content: string
}

type ReadFileToolError = {
  ok: false
  path: string
  code:
    | 'invalid_param'
    | 'not_found'
    | 'not_file'
    | 'file_type_blocked'
    | 'read_error'
  message: string
}

export type ReadFileToolResult = ReadFileToolOk | ReadFileToolError

const clampToPositiveInt = (
  value: number | undefined,
  fallback: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

const normalizePathInput = (path: string, baseDir?: string): string => {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return resolve(baseDir ?? '.', trimmed)
}

const cutByBytes = (
  lines: string[],
  maxBytes: number,
): { lines: string[]; truncated: boolean } => {
  if (maxBytes <= 0) return { lines, truncated: false }
  const selected: string[] = []
  let total = 0
  for (let i = 0; i < lines.length; i += 1) {
    const item = lines[i] ?? ''
    const nextBytes = Buffer.byteLength(`${item}\n`, 'utf8')
    if (selected.length > 0 && total + nextBytes > maxBytes)
      return { lines: selected, truncated: true }
    selected.push(item)
    total += nextBytes
    if (total > maxBytes)
      return { lines: selected, truncated: i < lines.length - 1 }
  }
  return { lines: selected, truncated: false }
}

const splitLines = (raw: string): string[] => raw.split(/\r?\n/)

const resolveLineWindow = (
  totalLines: number,
  startInput: number | undefined,
  limitInput: number | undefined,
  config: ReadFileToolConfig,
): { startIndex: number; maxLines: number; startLine: number } => {
  const startLine = clampToPositiveInt(startInput, 1)
  const startIndex = Math.min(totalLines, Math.max(0, startLine - 1))
  const requestedLimit = clampToPositiveInt(limitInput, config.defaultLines)
  const maxLines = Math.min(requestedLimit, Math.max(1, config.maxLines))
  return { startIndex, maxLines, startLine }
}

const makeError = (
  code: ReadFileToolError['code'],
  path: string,
  message: string,
): ReadFileToolError => ({ ok: false, code, path, message })

const parseErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  const { code } = error as { code?: unknown }
  return typeof code === 'string' ? code : undefined
}

const resolveAllowedExtensions = (
  extensions?: ReadonlySet<string>,
): ReadonlySet<string> => extensions ?? DEFAULT_ALLOWED_FILE_EXTENSIONS

export const executeReadFileTool = async (
  params: ReadFileToolParams,
  config: ReadFileToolConfig,
): Promise<ReadFileToolResult> => {
  const path = normalizePathInput(params.path, config.baseDir)
  if (!path) {
    return makeError(
      'invalid_param',
      params.path,
      'path is required for read_file',
    )
  }
  const allowedExtensions = resolveAllowedExtensions(config.allowedExtensions)
  if (!isPathAllowedByExtension(path, allowedExtensions)) {
    return makeError(
      'file_type_blocked',
      path,
      'file extension is not in read_file whitelist',
    )
  }
  try {
    const fileStat = await stat(path)
    if (!fileStat.isFile())
      return makeError('not_file', path, 'path is not a file')
    const raw = await readFile(path, 'utf8')
    const allLines = splitLines(raw)
    const totalLines = allLines.length
    const window = resolveLineWindow(
      totalLines,
      params.start,
      params.limit,
      config,
    )
    const selected = allLines.slice(
      window.startIndex,
      window.startIndex + window.maxLines,
    )
    const slicedByBytes = cutByBytes(selected, Math.max(0, config.maxBytes))
    const content = slicedByBytes.lines.join('\n')
    const end =
      slicedByBytes.lines.length > 0
        ? window.startIndex + slicedByBytes.lines.length
        : Math.min(window.startIndex, totalLines)
    const truncatedByLines = window.startIndex + window.maxLines < totalLines
    return {
      ok: true,
      path,
      start: Math.min(window.startLine, totalLines > 0 ? totalLines : 1),
      end,
      totalLines,
      truncated: truncatedByLines || slicedByBytes.truncated,
      content,
    }
  } catch (error) {
    const code = parseErrorCode(error)
    if (code === 'ENOENT') return makeError('not_found', path, 'file not found')
    if (code === 'EISDIR')
      return makeError('not_file', path, 'path is a directory')
    return makeError(
      'read_error',
      path,
      error instanceof Error ? error.message : String(error),
    )
  }
}
