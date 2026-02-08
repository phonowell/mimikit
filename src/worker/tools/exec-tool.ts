import exec from 'fire-keeper/exec'

import {
  asBoolean,
  asString,
  asStringArray,
  parseToolArgs,
  type ToolCallResult,
  type WorkerToolContext,
} from './common.js'
import { prependWorkDir } from './shell.js'

type ExecToolArgs = {
  command?: string | string[]
  cmd?: string | string[]
  silent?: boolean
}

export const runExecTool = async (
  context: WorkerToolContext,
  args: unknown,
): Promise<ToolCallResult> => {
  try {
    const parsed = parseToolArgs(args) as ExecToolArgs
    const source = parsed.command ?? parsed.cmd
    const command = Array.isArray(source)
      ? asStringArray(source, 'command')
      : asString(source, 'command')
    const silent = asBoolean(parsed.silent)
    const [code, last, all] = await exec(
      prependWorkDir(context.workDir, command),
      {
        silent,
      },
    )
    return {
      ok: code === 0,
      output: all.join('\n') || last,
      ...(code === 0 ? {} : { error: `exec_exit_${code}` }),
      details: { code, last },
    }
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
