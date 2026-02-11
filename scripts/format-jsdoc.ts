import { echo, glob, read, runConcurrent, write } from 'fire-keeper'

const listSources = () => glob(['./src/**/*.ts', './src/**/*.tsx'])

const formatJSDoc = (content: string): string => {
  const lines = content.split('\n')
  const result: string[] = []

  let index = 0
  while (index < lines.length) {
    const line = lines.at(index)
    const trimmed = line?.trim()

    if (trimmed === '/**') {
      const indent = line?.match(/^(\s*)/)?.[1] ?? ''
      const nextLine = lines.at(index + 1)
      const nextTrimmed = nextLine?.trim()
      const closeLine = lines.at(index + 2)
      const closeTrimmed = closeLine?.trim()

      if (
        nextTrimmed?.startsWith('* ') &&
        !nextTrimmed.startsWith('* @') &&
        closeTrimmed === '*/'
      ) {
        const comment = nextTrimmed.slice(2)
        result.push(`${indent}/** ${comment} */`)
        index += 3
        continue
      }
    }

    result.push(line ?? '')
    index += 1
  }

  return result.join('\n')
}

const processFile = async (filePath: string): Promise<string | null> => {
  const content = await read<string>(filePath)
  if (!content) return null

  const newContent = formatJSDoc(content)
  if (newContent === content) return null

  await write(filePath, newContent)
  return filePath
}

const main = async () => {
  const list = await listSources()
  if (!list.length) {
    echo('format-jsdoc', 'No source files found.')
    return
  }

  const changedFiles = (
    await runConcurrent(
      5,
      list.map((file) => () => processFile(file)),
    )
  ).filter(Boolean) as string[]

  if (!changedFiles.length) {
    echo('format-jsdoc', 'No JSDoc block needed formatting.')
    return
  }

  echo('format-jsdoc', `JSDoc formatted in ${changedFiles.length} file(s):`)
  changedFiles.forEach((file) => echo('format-jsdoc', `  ${file}`))
}

main()
