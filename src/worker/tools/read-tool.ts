import read from 'fire-keeper/read'

import {
  asString,
  parseToolArgs,
  resolveToolPath,
  type ToolCallResult,
  type WorkerToolContext,
} from './common.js'

type ReadToolArgs = {
  path?: string
  file_path?: string
}

export const runReadTool = async (
  context: WorkerToolContext,
  args: unknown,
): Promise<ToolCallResult> => {
  try {
    const parsed = parseToolArgs(args) as ReadToolArgs
    const path = asString(parsed.path ?? parsed.file_path, 'path')
    const resolvedPath = resolveToolPath(context.workDir, path)
    const value = await read(resolvedPath, { raw: true })
    if (value === undefined)
      return { ok: false, output: '', error: 'file_not_found' }
    if (Buffer.isBuffer(value)) {
      return {
        ok: true,
        output: value.toString('utf8'),
        details: { path: resolvedPath },
      }
    }
    return {
      ok: true,
      output:
        typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      details: { path: resolvedPath },
    }
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
