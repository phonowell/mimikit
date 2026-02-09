import { applyPatch } from 'diff'
import read from 'fire-keeper/read'
import write from 'fire-keeper/write'

import { buildArgsSchema, nonEmptyString } from '../../shared/args.js'
import { resolvePath } from '../../shared/path.js'

import type { Spec } from '../../model/spec.js'
import type { z } from 'zod'

const schema = buildArgsSchema({
  path: nonEmptyString,
  patch: nonEmptyString,
})

type Input = z.infer<typeof schema>

const toText = (value: unknown): string => {
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export const patchFileSpec: Spec<Input> = {
  name: 'patch_file',
  schema,
  run: async (context, args) => {
    const path = resolvePath(context.workDir, args.path)
    const fileRaw = await read(path, { raw: true })
    if (fileRaw === undefined)
      return { ok: false, output: '', error: 'file_not_found' }

    const source = toText(fileRaw)
    const patched = applyPatch(source, args.patch, {
      fuzzFactor: 0,
      autoConvertLineEndings: true,
    })
    if (patched === false)
      return { ok: false, output: '', error: 'patch_apply_failed' }

    const changed = patched !== source
    if (changed) await write(path, patched, { encoding: 'utf8' })

    return {
      ok: true,
      output: `patch ok: ${path}`,
      details: { path, changed },
    }
  },
}
