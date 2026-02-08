import read from 'fire-keeper/read'
import write from 'fire-keeper/write'

import {
  asBoolean,
  asString,
  parseToolArgs,
  resolveToolPath,
  type ToolCallResult,
  type WorkerToolContext,
} from './common.js'

type EditToolArgs = {
  path?: string
  file_path?: string
  oldText?: string
  old_string?: string
  newText?: string
  new_string?: string
  replaceAll?: boolean
}

const replaceFirst = (
  content: string,
  oldText: string,
  newText: string,
): string => {
  const index = content.indexOf(oldText)
  if (index < 0) throw new Error('old_text_not_found')
  return `${content.slice(0, index)}${newText}${content.slice(index + oldText.length)}`
}

export const runEditTool = async (
  context: WorkerToolContext,
  args: unknown,
): Promise<ToolCallResult> => {
  try {
    const parsed = parseToolArgs(args) as EditToolArgs
    const path = resolveToolPath(
      context.workDir,
      asString(parsed.path ?? parsed.file_path, 'path'),
    )
    const oldText = asString(parsed.oldText ?? parsed.old_string, 'oldText')
    const newText = asString(
      parsed.newText ?? parsed.new_string,
      'newText',
      false,
    )
    const replaceAll = asBoolean(parsed.replaceAll)
    const fileRaw = await read(path, { raw: true })
    if (!fileRaw) throw new Error('file_not_found')
    const raw = Buffer.isBuffer(fileRaw)
      ? fileRaw.toString('utf8')
      : typeof fileRaw === 'string'
        ? fileRaw
        : ''
    if (!raw && raw !== '') throw new Error('file_not_found')
    const next = replaceAll
      ? raw.split(oldText).join(newText)
      : replaceFirst(raw, oldText, newText)
    await write(path, next, { encoding: 'utf8' })
    return {
      ok: true,
      output: `edit ok: ${path}`,
      details: { path, replaceAll },
    }
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
