import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { z } from 'zod'

import { readErrorCode } from '../shared/error-code.js'

import type { Parsed } from '../actions/model/spec.js'
import type { ReadFileLookupMessage } from '../types/index.js'

const DEFAULT_MAX_CHARS = 4_000
const MAX_MAX_CHARS = 20_000
const MIN_MAX_CHARS = 1
const DEFAULT_FROM_LINE = 1
const MIN_FROM_LINE = 1
const DEFAULT_MAX_LINES = 100
const MAX_MAX_LINES = 500
const MIN_MAX_LINES = 1
const MAX_FILE_BYTES = 256 * 1_024

const nonEmptyString = z.string().trim().min(1)
const integerStringRe = /^[+-]?\d+$/
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

const boundedIntegerString = (params: {
  min: number
  max: number
  field: string
}) =>
  z
    .string()
    .trim()
    .regex(integerStringRe, `${params.field} must be an integer string`)
    .refine(
      (value) => {
        const parsed = Number(value)
        return (
          Number.isSafeInteger(parsed) &&
          parsed >= params.min &&
          parsed <= params.max
        )
      },
      `${params.field} must be in range [${params.min}, ${params.max}]`,
    )

export const readFileToolSchema = z
  .object({
    path: nonEmptyString,
    from_line: boundedIntegerString({
      min: MIN_FROM_LINE,
      max: Number.MAX_SAFE_INTEGER,
      field: 'from_line',
    }).optional(),
    max_lines: boundedIntegerString({
      min: MIN_MAX_LINES,
      max: MAX_MAX_LINES,
      field: 'max_lines',
    }).optional(),
    max_chars: boundedIntegerString({
      min: MIN_MAX_CHARS,
      max: MAX_MAX_CHARS,
      field: 'max_chars',
    }).optional(),
  })
  .strict()

export type ReadFileRequest = {
  path: string
  fromLine: number
  maxLines: number
  maxChars: number
}

const parseBoundedInt = (params: {
  raw: string | undefined
  defaultValue: number
}): number => {
  const { raw, defaultValue } = params
  if (!raw) return defaultValue
  return Number(raw)
}

const parseFromLine = (raw?: string): number =>
  parseBoundedInt({
    raw,
    defaultValue: DEFAULT_FROM_LINE,
  })

const parseMaxLines = (raw?: string): number =>
  parseBoundedInt({
    raw,
    defaultValue: DEFAULT_MAX_LINES,
  })

const parseMaxChars = (raw?: string): number =>
  parseBoundedInt({
    raw,
    defaultValue: DEFAULT_MAX_CHARS,
  })

const toReadFileRequest = (item: Parsed): ReadFileRequest | undefined => {
  const parsed = readFileToolSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return {
    path: parsed.data.path,
    fromLine: parseFromLine(parsed.data.from_line),
    maxLines: parseMaxLines(parsed.data.max_lines),
    maxChars: parseMaxChars(parsed.data.max_chars),
  }
}

export const pickReadFileRequest = (
  actions: Parsed[],
): ReadFileRequest | undefined => {
  for (const item of actions) {
    if (item.name !== 'read_file') continue
    const request = toReadFileRequest(item)
    if (request) return request
  }
  return undefined
}

const resolveAbsolutePath = (workDir: string, path: string): string =>
  isAbsolute(path) ? resolve(path) : resolve(workDir, path)

const toRepoRelativePath = (
  workDir: string,
  absolutePath: string,
): string | undefined => {
  const relativePath = relative(workDir, absolutePath)
  if (relativePath.startsWith('..') || isAbsolute(relativePath))
    return undefined
  return relativePath
}

const formatPathForPrompt = (repoRelativePath: string): string =>
  repoRelativePath.replace(/\\/g, '/')

const toErrorMessage = (errorCode: string | undefined): string => {
  if (errorCode === 'ENOENT') return 'read_file failed: file does not exist'
  if (errorCode === 'EISDIR') return 'read_file failed: path is a directory'
  if (errorCode === 'EACCES' || errorCode === 'EPERM')
    return 'read_file failed: permission denied'
  return 'read_file failed: unable to read file'
}

const decodeUtf8Text = (raw: Buffer): string => utf8Decoder.decode(raw)

const collectLineStarts = (text: string): number[] => {
  if (!text) return []
  const starts = [0]
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10 && index + 1 < text.length)
      starts.push(index + 1)
  }
  return starts
}

const sliceTextByLines = (params: {
  text: string
  fromLine: number
  maxLines: number
}): {
  content: string
  lineCount: number
  totalLines: number
  truncated: boolean
} => {
  const lineStarts = collectLineStarts(params.text)
  const totalLines = lineStarts.length
  if (totalLines === 0 || params.fromLine > totalLines) {
    return {
      content: '',
      lineCount: 0,
      totalLines,
      truncated: false,
    }
  }
  const startLineIndex = params.fromLine - 1
  const endLineExclusiveIndex = Math.min(
    totalLines,
    startLineIndex + params.maxLines,
  )
  const startOffset = lineStarts[startLineIndex] ?? params.text.length
  const endOffset =
    endLineExclusiveIndex >= totalLines
      ? params.text.length
      : (lineStarts[endLineExclusiveIndex] ?? params.text.length)
  return {
    content: params.text.slice(startOffset, endOffset),
    lineCount: endLineExclusiveIndex - startLineIndex,
    totalLines,
    truncated: endLineExclusiveIndex < totalLines,
  }
}

const buildReadFileError = (
  path: string,
  error: string,
): ReadFileLookupMessage => ({
  path,
  status: 'error',
  encoding: 'utf-8',
  error,
})

export const runReadFileTool = async (params: {
  workDir: string
  request: ReadFileRequest
}): Promise<ReadFileLookupMessage> => {
  const resolvedWorkDir = resolve(params.workDir)
  const absolutePath = resolveAbsolutePath(resolvedWorkDir, params.request.path)
  const repoRelativePath = toRepoRelativePath(resolvedWorkDir, absolutePath)
  const displayPath =
    repoRelativePath !== undefined
      ? formatPathForPrompt(repoRelativePath)
      : params.request.path.trim()

  if (repoRelativePath === undefined) {
    return buildReadFileError(
      displayPath,
      'read_file failed: path is outside repository work_dir',
    )
  }

  try {
    const raw = await readFile(absolutePath)
    if (raw.byteLength > MAX_FILE_BYTES) {
      return buildReadFileError(
        displayPath,
        `read_file failed: file is too large (${raw.byteLength} bytes > ${MAX_FILE_BYTES})`,
      )
    }
    const decoded = decodeUtf8Text(raw)
    const slicedByLines = sliceTextByLines({
      text: decoded,
      fromLine: params.request.fromLine,
      maxLines: params.request.maxLines,
    })
    const charsTruncated =
      slicedByLines.content.length > params.request.maxChars
    const trimmed = charsTruncated
      ? slicedByLines.content.slice(0, params.request.maxChars)
      : slicedByLines.content
    return {
      path: displayPath,
      status: 'ok',
      encoding: 'utf-8',
      chars: decoded.length,
      fromLine: params.request.fromLine,
      lineCount: slicedByLines.lineCount,
      totalLines: slicedByLines.totalLines,
      truncated: slicedByLines.truncated || charsTruncated,
      content: trimmed,
    }
  } catch (error) {
    if (error instanceof TypeError) {
      return buildReadFileError(
        displayPath,
        'read_file failed: file is not valid UTF-8 text',
      )
    }
    const code = readErrorCode(error)
    return buildReadFileError(displayPath, toErrorMessage(code))
  }
}

export const buildReadFileLookupKey = (
  request?: ReadFileRequest,
): string | undefined => {
  if (!request) return undefined
  return `${request.path}\n${request.fromLine}\n${request.maxLines}\n${request.maxChars}`
}
