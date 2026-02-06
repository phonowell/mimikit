import { basename, extname } from 'node:path'

const WHITELIST_BASENAMES = new Set([
  '.env',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.pnpmfile.cjs',
])

export const DEFAULT_ALLOWED_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.xml',
])

const normalizeExtension = (path: string): string => extname(path).toLowerCase()

const normalizeBasename = (path: string): string => basename(path).toLowerCase()

export const isPathAllowedByExtension = (
  path: string,
  allowedExtensions: ReadonlySet<string>,
): boolean => {
  if (WHITELIST_BASENAMES.has(normalizeBasename(path))) return true
  return allowedExtensions.has(normalizeExtension(path))
}
