import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureDir } from '../fs/ensure.js'
import { makeSlug } from '../memory/slug.js'
import { nowIso } from '../time.js'

import type { ToolContext } from './context.js'

export type RememberArgs = { content: string; longTerm?: boolean }

export const remember = async (ctx: ToolContext, args: RememberArgs) => {
  const timestamp = nowIso()
  if (args.longTerm) {
    await ensureDir(ctx.paths.root)
    const entry = `\n[${timestamp}] ${args.content}\n`
    await appendFile(ctx.paths.memory, entry, 'utf8')
    return { path: ctx.paths.memory }
  }

  const day = timestamp.slice(0, 10)
  const slug = makeSlug(args.content)
  await ensureDir(ctx.paths.memoryDir)
  let filename = `${day}-${slug}.md`
  let path = join(ctx.paths.memoryDir, filename)
  let i = 1
  for (;;) {
    try {
      await import('node:fs/promises').then((fs) => fs.stat(path))
      filename = `${day}-${slug}-${i}.md`
      path = join(ctx.paths.memoryDir, filename)
      i += 1
    } catch {
      break
    }
  }
  const entry = `# ${day}\n\n[${timestamp}] ${args.content}\n`
  await appendFile(path, entry, 'utf8')
  return { path }
}
