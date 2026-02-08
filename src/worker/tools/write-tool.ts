import write from 'fire-keeper/write'

import {
  asString,
  parseToolArgs,
  resolveToolPath,
  type ToolCallResult,
  type WorkerToolContext,
} from './common.js'

type WriteToolArgs = {
  path?: string
  file_path?: string
  content?: string
}

export const runWriteTool = async (
  context: WorkerToolContext,
  args: unknown,
): Promise<ToolCallResult> => {
  try {
    const parsed = parseToolArgs(args) as WriteToolArgs
    const path = resolveToolPath(
      context.workDir,
      asString(parsed.path ?? parsed.file_path, 'path'),
    )
    const content = asString(parsed.content, 'content', false)
    await write(path, content, { encoding: 'utf8' })
    return {
      ok: true,
      output: `write ok: ${path}`,
      details: { path, bytes: Buffer.byteLength(content, 'utf8') },
    }
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
