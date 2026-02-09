import { isAbsolute, relative, resolve } from 'node:path'

import glob from 'fire-keeper/glob'
import read from 'fire-keeper/read'
import { z } from 'zod'

import { buildArgsSchema, nonEmptyString } from '../../shared/args.js'

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
  pattern: nonEmptyString,
  path_glob: nonEmptyString.optional(),
  max_results: intLike.pipe(z.number().int().min(1).max(200)).optional(),
})

type Input = z.infer<typeof schema>

const toText = (value: unknown): string | undefined => {
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (typeof value === 'string') return value
  return undefined
}

const toAbsoluteGlob = (workDir: string, pattern: string): string =>
  isAbsolute(pattern) ? pattern : resolve(workDir, pattern)

const isIgnoredPath = (path: string): boolean =>
  path.includes('/.git/') || path.includes('/node_modules/')

export const searchFilesSpec: Spec<Input> = {
  name: 'search_files',
  schema,
  run: async (context, args) => {
    const pathGlob = args.path_glob ?? '**/*'
    const maxResults = args.max_results ?? 50
    const files = await glob(toAbsoluteGlob(context.workDir, pathGlob), {
      absolute: true,
      onlyFiles: true,
      dot: true,
    })

    const matches: string[] = []
    let scannedFiles = 0

    for (const absPath of files) {
      if (matches.length >= maxResults) break
      if (isIgnoredPath(absPath)) continue
      scannedFiles += 1
      const raw = await read(absPath, { raw: true })
      const text = toText(raw)
      if (text === undefined) continue
      if (text.includes('\u0000')) continue

      const lines = text.replace(/\r\n/g, '\n').split('\n')
      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= maxResults) break
        const line = lines[index] ?? ''
        if (!line.includes(args.pattern)) continue
        matches.push(
          `${relative(context.workDir, absPath)}:${index + 1}:${line}`,
        )
      }
    }

    return {
      ok: true,
      output: matches.join('\n'),
      details: {
        pattern: args.pattern,
        path_glob: pathGlob,
        max_results: maxResults,
        match_count: matches.length,
        scanned_files: scannedFiles,
      },
    }
  },
}
