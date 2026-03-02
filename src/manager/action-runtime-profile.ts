import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ensureDir } from '../fs/paths.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { readErrorCode } from '../shared/error-code.js'
import { newId, nowIso } from '../shared/utils.js'

import { writeProfileSchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from './runtime-adapter.js'

const normalizeProfileContent = (value: string): string =>
  value.replace(/\r\n/g, '\n')

const writeStateMarkdown = async (
  path: string,
  content: string,
): Promise<void> => {
  await ensureDir(dirname(path))
  await writeFile(path, content, 'utf8')
}

const readCurrentPersona = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return ''
    throw error
  }
}

const backupPersonaVersion = async (
  runtime: RuntimeState,
  previous: string,
): Promise<void> => {
  if (!previous) return
  await ensureDir(runtime.paths.agentPersonaVersionsDir)
  const versionFile = join(
    runtime.paths.agentPersonaVersionsDir,
    `${nowIso().replace(/[:.]/g, '-')}-${newId()}.md`,
  )
  await writeFile(versionFile, previous, 'utf8')
}

export const applyWriteProfileAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = writeProfileSchema.safeParse(item.attrs)
  if (!parsed.success) return

  const next = normalizeProfileContent(parsed.data.content)
  if (parsed.data.target === 'persona') {
    const current = await readCurrentPersona(runtime.paths.agentPersona)
    if (current === next) return
    await backupPersonaVersion(runtime, current)
    await writeStateMarkdown(runtime.paths.agentPersona, next)
    return
  }

  const current = await readTextFileIfExists(runtime.paths.userProfile)
  if (current === next) return
  await writeStateMarkdown(runtime.paths.userProfile, next)
}
