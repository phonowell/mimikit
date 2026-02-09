import write from 'fire-keeper/write'
import { z } from 'zod'

import { buildArgsSchema, nonEmptyString } from '../../shared/args.js'
import { resolvePath } from '../../shared/path.js'

import type { Spec } from '../../model/spec.js'

const schema = buildArgsSchema({
  path: nonEmptyString,
  content: z.string(),
})

type Input = z.infer<typeof schema>

export const writeFileSpec: Spec<Input> = {
  name: 'write_file',
  schema,
  run: async (context, args) => {
    const path = resolvePath(context.workDir, args.path)
    await write(path, args.content, { encoding: 'utf8' })
    return {
      ok: true,
      output: `write ok: ${path}`,
      details: { path, bytes: Buffer.byteLength(args.content, 'utf8') },
    }
  },
}
