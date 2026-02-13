import exec from 'fire-keeper/exec'

import {
  buildArgsSchema,
  nonEmptyString,
  prependWorkDir,
} from '../../shared/args.js'

import type { Spec } from '../../model/spec.js'
import type { z } from 'zod'

const schema = buildArgsSchema({
  command: nonEmptyString,
})

type Input = z.infer<typeof schema>

const buildCommand = (workDir: string, command: string): string[] => [
  ...prependWorkDir(workDir, []),
  `pnpm exec agent-browser ${command} --json`,
]

type CommandResult = {
  code: number
  last: string
  output: string
}

const runCommand = async (command: string[]): Promise<CommandResult> => {
  const [code, last, all] = await exec(command, {
    echo: false,
    silent: true,
  })
  return {
    code,
    last,
    output: all.join('\n') || last,
  }
}

const toFailure = (
  code: number,
  output: string,
  details: Record<string, unknown>,
): {
  ok: false
  output: string
  error: string
  details: Record<string, unknown>
} => ({
  ok: false,
  output,
  error: `browser_exit_${code}`,
  details,
})

export const runBrowserSpec: Spec<Input> = {
  name: 'run_browser',
  schema,
  run: async (context, args) => {
    const result = await runCommand(buildCommand(context.workDir, args.command))
    if (result.code === 0) {
      return {
        ok: true,
        output: result.output,
        details: { command: args.command },
      }
    }
    return toFailure(result.code, result.output, {
      command: args.command,
    })
  },
}
