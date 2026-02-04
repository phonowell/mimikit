import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const parseTaskLimit = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 200
  return Math.min(Math.floor(parsed), 500)
}

export const parseMessageLimit = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.floor(parsed)
}

export const resolveRoots = () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const rootDir = resolve(__dirname, '..', '..')
  return {
    rootDir,
    webDir: resolve(__dirname, '..', 'webui'),
    markedDir: resolve(rootDir, 'node_modules', 'marked', 'lib'),
    purifyDir: resolve(rootDir, 'node_modules', 'dompurify', 'dist'),
  }
}
