import { createHash } from 'node:crypto'

export const hashPromptPrefix = (prefix: string): string =>
  createHash('sha256').update(prefix, 'utf8').digest('hex')
