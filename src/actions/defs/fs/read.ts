import read from 'fire-keeper/read'
import write from 'fire-keeper/write'
import { z } from 'zod'

import {
  buildArgsSchema,
  nonEmptyString,
  resolvePath,
} from '../../shared/args.js'

import type { Spec } from '../../model/spec.js'

const intLike = z.union([
  z.number().int(),
  z
    .string()
    .trim()
    .transform((value, context) => {
      if (!/^[0-9]+$/.test(value)) {
        context.addIssue({ code: 'custom', message: 'integer_expected' })
        return z.NEVER
      }
      return Number.parseInt(value, 10)
    }),
])

const schema = buildArgsSchema({
  path: nonEmptyString,
  start_line: intLike.pipe(z.number().int().min(1)).optional(),
  line_count: intLike.pipe(z.number().int().min(1).max(500)).optional(),
})

type Input = z.infer<typeof schema>

const writeSchema = buildArgsSchema({
  path: nonEmptyString,
  content: z.string(),
})

type WriteInput = z.infer<typeof writeSchema>

const normalizeContent = (value: unknown): string => {
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export const readFileSpec: Spec<Input> = {
  name: 'read_file',
  schema,
  run: async (context, args) => {
    const path = resolvePath(context.workDir, args.path)
    const value = await read(path, { raw: true, echo: false })
    if (value === undefined)
      return { ok: false, output: '', error: 'file_not_found' }

    const content = normalizeContent(value)
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()

    const startLine = args.start_line ?? 1
    const lineCount = args.line_count ?? 100
    const startIndex = startLine - 1
    const selected = lines.slice(startIndex, startIndex + lineCount)
    const endLine =
      selected.length > 0 ? startLine + selected.length - 1 : startLine - 1

    return {
      ok: true,
      output: selected.join('\n'),
      details: {
        path,
        total_lines: lines.length,
        start_line: startLine,
        line_count: lineCount,
        end_line: endLine,
      },
    }
  },
}

export const writeFileSpec: Spec<WriteInput> = {
  name: 'write_file',
  schema: writeSchema,
  run: async (context, args) => {
    const path = resolvePath(context.workDir, args.path)
    await write(path, args.content, { encoding: 'utf8' }, { echo: false })
    return {
      ok: true,
      output: `write ok: ${path}`,
      details: { path, bytes: Buffer.byteLength(args.content, 'utf8') },
    }
  },
}
