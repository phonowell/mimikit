import { relative, resolve } from 'node:path'

import { echo, glob } from 'fire-keeper'
import { Node, Project, SyntaxKind } from 'ts-morph'

type GuardViolation = {
  filePath: string
  line: number
  column: number
  length: number
  preview: string
}

const GUARD_GLOBS = [
  './src/**/*.ts',
  '!./src/**/*.d.ts',
  '!./src/prompts/**',
  '!./src/**/__generated__/**',
]

const EXEMPT_MARKER = 'prompt-guard-exempt:'
const PREVIEW_MAX_CHARS = 120

const hasCjk = (text: string): boolean => /\p{Script=Han}/u.test(text)

const englishWordCount = (text: string): number =>
  (text.match(/[A-Za-z]{2,}/g) ?? []).length

const normalizeLiteralText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim()

const isLikelyPromptLiteral = (text: string): boolean => {
  const normalized = normalizeLiteralText(text)
  if (!normalized) return false

  const naturalLanguageLikely =
    hasCjk(normalized) || englishWordCount(normalized) >= 8
  if (!naturalLanguageLikely) return false

  const hasPromptShape =
    normalized.includes('<M:') ||
    normalized.includes('{{') ||
    normalized.includes('```')
  const hasMultiLine = text.includes('\n')
  if (!hasMultiLine && !hasPromptShape) return false
  const minLength = hasPromptShape ? 40 : 80

  return normalized.length >= minLength
}

const literalTextFromNode = (node: Node): string | undefined => {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))
    return node.getLiteralText()

  if (!Node.isTemplateExpression(node)) return undefined

  const segments = [node.getHead().getLiteralText()]
  for (const span of node.getTemplateSpans()) {
    segments.push('${expr}')
    segments.push(span.getLiteral().getLiteralText())
  }
  return segments.join('')
}

const isExemptByComment = (lines: string[], line: number): boolean => {
  const current = lines[line - 1] ?? ''
  const previous = lines[line - 2] ?? ''
  return current.includes(EXEMPT_MARKER) || previous.includes(EXEMPT_MARKER)
}

const buildViolation = (params: {
  filePath: string
  line: number
  column: number
  literalText: string
}): GuardViolation => {
  const normalized = normalizeLiteralText(params.literalText)
  return {
    filePath: params.filePath,
    line: params.line,
    column: params.column,
    length: normalized.length,
    preview:
      normalized.length > PREVIEW_MAX_CHARS
        ? `${normalized.slice(0, PREVIEW_MAX_CHARS)}...`
        : normalized,
  }
}

const collectViolations = async (): Promise<GuardViolation[]> => {
  const files = await glob(GUARD_GLOBS)
  if (!files.length) return []

  const project = new Project({
    tsConfigFilePath: './tsconfig.json',
  })
  const sourceFiles = project.addSourceFilesAtPaths(files)

  const violations: GuardViolation[] = []
  for (const sourceFile of sourceFiles) {
    const lines = sourceFile.getFullText().split(/\r?\n/u)
    const nodes = sourceFile.getDescendants().filter((node) => {
      const kind = node.getKind()
      return (
        kind === SyntaxKind.StringLiteral ||
        kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
        kind === SyntaxKind.TemplateExpression
      )
    })

    for (const node of nodes) {
      const literalText = literalTextFromNode(node)
      if (!literalText || !isLikelyPromptLiteral(literalText)) continue

      const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart())
      if (isExemptByComment(lines, line)) continue

      violations.push(
        buildViolation({
          filePath: sourceFile.getFilePath(),
          line,
          column,
          literalText,
        }),
      )
    }
  }

  return violations.sort((left, right) =>
    left.filePath === right.filePath
      ? left.line - right.line
      : left.filePath.localeCompare(right.filePath),
  )
}

const main = async () => {
  const violations = await collectViolations()
  if (violations.length === 0) {
    echo('prompt-hardcode-guard: passed')
    return
  }

  echo(
    `prompt-hardcode-guard: found ${violations.length} violation(s); move prompt text into prompts/ templates or add ${EXEMPT_MARKER} reason`,
  )

  const cwd = process.cwd()
  for (const violation of violations) {
    const displayPath = relative(cwd, resolve(violation.filePath))
    echo(
      ` - ${displayPath}:${violation.line}:${violation.column} len=${String(violation.length)} :: ${violation.preview}`,
    )
  }

  process.exitCode = 1
}

main()
