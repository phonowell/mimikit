import { getInvokableSpec } from '../registry/index.js'
import { parseArgs } from '../shared/args.js'
import { safeRun } from '../shared/safe-run.js'

import type { Result } from '../model/result.js'
import type { Context } from '../model/spec.js'

export const invokeAction = (
  context: Context,
  name: string,
  args: unknown,
): Promise<Result> => {
  const spec = getInvokableSpec(name)
  if (!spec) {
    return Promise.resolve({
      ok: false,
      output: '',
      error: `unknown_action:${name}`,
    })
  }

  return safeRun(() => {
    const parsed = parseArgs(args, spec.schema)
    return spec.run(context, parsed)
  })
}
