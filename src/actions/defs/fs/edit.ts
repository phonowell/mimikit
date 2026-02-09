import read from 'fire-keeper/read'
import write from 'fire-keeper/write'
import { z } from 'zod'

import {
  booleanLike,
  buildArgsSchema,
  nonEmptyString,
} from '../../shared/args.js'
import { resolvePath } from '../../shared/path.js'

import type { Spec } from '../../model/spec.js'

const schema = buildArgsSchema({
  path: nonEmptyString,
  old_text: nonEmptyString,
  new_text: z.string(),
  replace_all: booleanLike,
})

type Input = z.infer<typeof schema>

const replaceFirst = (
  content: string,
  oldText: string,
  nextText: string,
): string => {
  const index = content.indexOf(oldText)
  if (index < 0) throw new Error('old_text_not_found')
  return `${content.slice(0, index)}${nextText}${content.slice(index + oldText.length)}`
}

export const editFileSpec: Spec<Input> = {
  name: 'edit_file',
  schema,
  run: async (context, args) => {
    const path = resolvePath(context.workDir, args.path)

    const fileRaw = await read(path, { raw: true })
    if (fileRaw === undefined) throw new Error('file_not_found')
    const raw = Buffer.isBuffer(fileRaw)
      ? fileRaw.toString('utf8')
      : typeof fileRaw === 'string'
        ? fileRaw
        : ''
    if (!raw && raw !== '') throw new Error('file_not_found')

    const next = args.replace_all
      ? raw.split(args.old_text).join(args.new_text)
      : replaceFirst(raw, args.old_text, args.new_text)
    await write(path, next, { encoding: 'utf8' })

    return {
      ok: true,
      output: `edit ok: ${path}`,
      details: { path, replace_all: args.replace_all },
    }
  },
}
