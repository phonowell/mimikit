import exec from 'fire-keeper/exec'

import {
  asString,
  parseToolArgs,
  prependWorkDir,
  type ToolCallResult,
  type WorkerToolContext,
} from './common.js'

type BrowserToolArgs = {
  input?: string
  command?: string
}

const buildAgentBrowserCommand = (
  workDir: string,
  command: string,
): string[] => [
  ...prependWorkDir(workDir, []),
  `npx -y agent-browser ${command} --json`,
]

export const runBrowserTool = async (
  context: WorkerToolContext,
  args: unknown,
): Promise<ToolCallResult> => {
  try {
    const parsed = parseToolArgs(args) as BrowserToolArgs
    const command = asString(parsed.command ?? parsed.input, 'command')
    const [code, last, all] = await exec(
      buildAgentBrowserCommand(context.workDir, command),
      {
        silent: true,
      },
    )
    const output = all.join('\n') || last
    return {
      ok: code === 0,
      output,
      ...(code === 0 ? {} : { error: `browser_exit_${code}` }),
      details: { command },
    }
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
