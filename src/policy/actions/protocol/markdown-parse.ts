import remarkParse from 'remark-parse'
import { unified } from 'unified'

const markdownParser = unified().use(remarkParse)

export type MarkdownTree = ReturnType<typeof markdownParser.parse>

export const parseMarkdown = (text: string): MarkdownTree =>
  markdownParser.parse(text)
