import { echo, glob, read, runConcurrent, write } from 'fire-keeper'

import { listTextSources } from './shared/text-sources.js'

const listSources = () => glob(listTextSources())

const normalizeLf = async (filePath: string): Promise<string | null> => {
  const raw = await read<undefined, string, true>(filePath, {
    raw: true,
    echo: false,
  })
  if (!raw) return null

  const content =
    typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : null
  if (!content) return null

  const normalized = content.replace(/\r/g, '')
  if (normalized === content) return null
  await write(filePath, normalized, {}, { echo: false })
  return filePath
}

const main = async () => {
  const list = await listSources()
  if (!list.length) {
    echo('fix-crlf: changed 0 file(s).')
    return
  }

  const changedFiles = (
    await runConcurrent(
      5,
      list.map((file) => () => normalizeLf(file)),
    )
  ).filter(Boolean) as string[]

  if (!changedFiles.length) {
    echo('fix-crlf: changed 0 file(s).')
    return
  }

  echo(`fix-crlf: changed ${changedFiles.length} file(s).`)
}

main()
