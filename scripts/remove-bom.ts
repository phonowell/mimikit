import { echo, glob, read, runConcurrent, wrapList, write } from 'fire-keeper'

const sources = [
  './*.{js,ts,mjs,cjs}',
  './src/**/*.{js,ts,tsx,mjs,cjs}',
  './scripts/**/*.{js,ts,tsx,mjs,cjs}',
  './test/**/*.{js,ts,tsx,mjs,cjs}',
]

const listSources = () => glob(sources)

const hasUtf8Bom = (buffer: Buffer): boolean =>
  buffer.length >= 3 &&
  buffer[0] === 0xef &&
  buffer[1] === 0xbb &&
  buffer[2] === 0xbf

const stripBom = async (filePath: string): Promise<string | null> => {
  const raw = await read<undefined, string, true>(filePath, { raw: true })
  if (!raw) return null

  if (typeof raw === 'string') {
    if (raw.charCodeAt(0) !== 0xfeff) return null
    await write(filePath, raw.slice(1))
    return filePath
  }

  if (Buffer.isBuffer(raw)) {
    if (!hasUtf8Bom(raw)) return null
    await write(filePath, raw.subarray(3))
    return filePath
  }

  return null
}

const main = async () => {
  const list = await listSources()
  if (!list.length) {
    echo('remove-bom', `no files found matching ${wrapList(sources)}`)
    return
  }

  const changedFiles = (
    await runConcurrent(
      5,
      list.map((file) => () => stripBom(file)),
    )
  ).filter(Boolean) as string[]

  if (!changedFiles.length) {
    echo('remove-bom', 'No files needed BOM removal.')
    return
  }

  echo('remove-bom', `BOM removed in ${changedFiles.length} file(s):`)
  changedFiles.forEach((file) => echo('remove-bom', `  ${file}`))
}

main()
