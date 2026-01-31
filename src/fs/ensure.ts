import { mkdir } from 'node:fs/promises'

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true })
}
