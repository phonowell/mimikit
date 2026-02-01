import { echo, glob, read, runConcurrent, wrapList, write } from 'fire-keeper'

import { listTextSources } from './shared/text-sources.js'

const listSources = () => glob(listTextSources())

const normalizeLf = async (filePath: string): Promise<string | null> => {
  const raw = await read<undefined, string, true>(filePath, { raw: true })
  if (!raw) return null

  const content =
    typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : null
  if (!content) return null

  const normalized = content.replace(/\r/g, '')
  if (normalized === content) return null
  await write(filePath, normalized)
  return filePath
}

const main = async () => {
  const list = await listSources()
  if (!list.length) {
    echo('fix-crlf', `no files found matching ${wrapList(listTextSources())}`)
    return
  }

  const changedFiles = (
    await runConcurrent(
      5,
      list.map((file) => () => normalizeLf(file)),
    )
  ).filter(Boolean) as string[]

  if (!changedFiles.length) {
    echo('fix-crlf', 'No files needed LF normalization.')
    return
  }

  echo('fix-crlf', `LF normalized in ${changedFiles.length} file(s):`)
  changedFiles.forEach((file) => echo('fix-crlf', `  ${file}`))
}

main()
