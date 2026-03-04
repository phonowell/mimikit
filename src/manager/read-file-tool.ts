import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { resolveFromRoot, toPathWithinRoot } from '../fs/path-safety.js'
import { readErrorCode } from '../shared/error-code.js'

import { decodeUtf8Text, sliceTextByLines } from './read-file-content.js'
import {
  buildReadFileLookupKey,
  pickReadFileRequest,
  readFileToolSchema,
  type ReadFileRequest,
} from './read-file-request.js'

import type { ReadFileLookupMessage } from '../types/index.js'

const MAX_FILE_BYTES = 256 * 1_024
const NON_REGULAR_FILE_ERROR =
  'read_file failed: path is not a regular file'

const formatPathForPrompt = (repoRelativePath: string): string =>
  repoRelativePath.replace(/\\/g, '/')

const toErrorMessage = (errorCode: string | undefined): string => {
  if (errorCode === 'ENOENT') return 'read_file failed: file does not exist'
  if (errorCode === 'EISDIR') return 'read_file failed: path is a directory'
  if (errorCode === 'EACCES' || errorCode === 'EPERM')
    return 'read_file failed: permission denied'
  return 'read_file failed: unable to read file'
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

export { buildReadFileLookupKey, pickReadFileRequest, readFileToolSchema }
export type { ReadFileRequest }

export const runReadFileTool = async (params: {
  workDir: string
  request: ReadFileRequest
}): Promise<ReadFileLookupMessage> => {
  const resolvedWorkDir = resolve(params.workDir)
  const absolutePath = resolveFromRoot(resolvedWorkDir, params.request.path)
  const repoRelativePath = toPathWithinRoot(resolvedWorkDir, absolutePath)
  const displayPath =
    repoRelativePath !== undefined
      ? formatPathForPrompt(repoRelativePath)
      : params.request.path.trim()

  try {
    const stats = await stat(absolutePath)
    if (!stats.isFile()) {
      return buildReadFileError(displayPath, NON_REGULAR_FILE_ERROR)
    }
  } catch (error) {
    const code = readErrorCode(error)
    return buildReadFileError(displayPath, toErrorMessage(code))
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
