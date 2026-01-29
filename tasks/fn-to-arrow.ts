import { ESLint } from 'eslint'
import { glob, runConcurrent } from 'fire-keeper'
import { type FunctionDeclaration, Project, SyntaxKind } from 'ts-morph'

const isObjectMethod = (fn: FunctionDeclaration): boolean => {
  const parent = fn.getParent()
  return parent.getKind() === SyntaxKind.ObjectLiteralExpression
}

const convertFunctionToArrow = (fn: FunctionDeclaration): boolean => {
  if (isObjectMethod(fn)) return false

  const name = fn.getName()
  if (!name) return false
  if (fn.getOverloads().length > 0) return false

  const isExported = fn.hasExportKeyword()
  const isDefaultExport = fn.hasDefaultKeyword()
  const isAsync = fn.isAsync()
  const typeParameters = fn
    .getTypeParameters()
    .map((tp) => tp.getText())
    .join(', ')
  const parameters = fn.getParameters()
  const returnType = fn.getReturnTypeNode()?.getText() ?? ''
  const bodyNode = fn.getBody()
  if (!bodyNode) return false
  const body = bodyNode.getText()

  const typeParamsText = typeParameters ? `<${typeParameters}>` : ''
  const returnTypeText = returnType ? `: ${returnType}` : ''
  const asyncKeyword = isAsync ? 'async ' : ''

  const paramsText =
    parameters.length > 1
      ? `(\n  ${parameters.map((p) => p.getText()).join(',\n  ')},\n)`
      : `(${parameters.map((p) => p.getText()).join(', ')})`

  let replacement = ''
  if (isDefaultExport)
    replacement = `const ${name} = ${asyncKeyword}${typeParamsText}${paramsText}${returnTypeText} => ${body}\nexport default ${name}`
  else if (isExported)
    replacement = `export const ${name} = ${asyncKeyword}${typeParamsText}${paramsText}${returnTypeText} => ${body}`
  else
    replacement = `const ${name} = ${asyncKeyword}${typeParamsText}${paramsText}${returnTypeText} => ${body}`

  fn.replaceWithText(replacement)
  return true
}

const processFile = async (filePath: string): Promise<string | null> => {
  const project = new Project()
  const sourceFile = project.addSourceFileAtPath(filePath)

  const functions = sourceFile.getDescendantsOfKind(
    SyntaxKind.FunctionDeclaration,
  )
  if (!functions.length) return null

  let hasChanges = false
  for (const fn of functions) {
    if (convertFunctionToArrow(fn)) hasChanges = true
  }

  if (!hasChanges) return null

  await sourceFile.save()
  return filePath
}

const format = async (files: string[]): Promise<void> => {
  if (!files.length) return
  const eslint = new ESLint({ fix: true })
  const results = await eslint.lintFiles(files)
  await ESLint.outputFixes(results)
}

const listSources = () =>
  glob(['./src/**/*.ts', './src/**/*.tsx', '!**/*.d.ts'])

const main = async () => {
  const list = await listSources()
  if (!list.length) return

  const changedFiles = (
    await runConcurrent(
      5,
      list.map((it) => () => processFile(it)),
    )
  ).filter(Boolean) as string[]

  if (changedFiles.length) {
    console.log(`✓ ${changedFiles.length} 个文件已转换`)
    changedFiles.forEach((file) => console.log(`  ${file}`))
    await format(changedFiles)
    console.log('✓ ESLint 格式化完成')
  } else console.log('无需转换的文件')
}

export default main
