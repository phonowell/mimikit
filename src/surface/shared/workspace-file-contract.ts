export const WORKSPACE_FILE_ROUTE = '/api/workspace-file'

const SUPPORTED_WORKSPACE_FILE_EXTENSIONS = [
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.markdown',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
] as const

export const isMarkdownPath = (value: string): boolean =>
  /\.(md|markdown)$/i.test(value.split(/[?#]/, 1)[0] ?? '')

export const isSupportedWorkspaceFilePath = (value: string): boolean => {
  const pathname = value.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  return SUPPORTED_WORKSPACE_FILE_EXTENSIONS.some((extension) =>
    pathname.endsWith(extension),
  )
}
