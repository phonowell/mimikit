import exec from 'fire-keeper/exec'

import { buildArgsSchema, nonEmptyString } from '../../shared/args.js'
import { prependWorkDir } from '../../shared/shell.js'

import type { Spec } from '../../model/spec.js'
import type { z } from 'zod'

const schema = buildArgsSchema({
  command: nonEmptyString,
})

type Input = z.infer<typeof schema>

const buildCommand = (workDir: string, command: string): string[] => [
  ...prependWorkDir(workDir, []),
  `npx -y agent-browser ${command} --json`,
]

export const runBrowserSpec: Spec<Input> = {
  name: 'run_browser',
  schema,
  run: async (context, args) => {
    const [code, last, all] = await exec(
      buildCommand(context.workDir, args.command),
      {
        silent: true,
      },
    )
    const output = all.join('\n') || last
    return {
      ok: code === 0,
      output,
      ...(code === 0 ? {} : { error: `browser_exit_${code}` }),
      details: { command: args.command },
    }
  },
}
