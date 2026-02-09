import exec from 'fire-keeper/exec'

import { buildArgsSchema, nonEmptyString } from '../../shared/args.js'
import { prependWorkDir } from '../../shared/shell.js'

import type { Spec } from '../../model/spec.js'
import type { z } from 'zod'

const schema = buildArgsSchema({
  command: nonEmptyString,
})

type Input = z.infer<typeof schema>

export const execShellSpec: Spec<Input> = {
  name: 'exec_shell',
  schema,
  run: async (context, args) => {
    const [code, last, all] = await exec(
      prependWorkDir(context.workDir, args.command),
      {
        silent: false,
      },
    )
    return {
      ok: code === 0,
      output: all.join('\n') || last,
      ...(code === 0 ? {} : { error: `exec_exit_${code}` }),
      details: { code, last },
    }
  },
}
