import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const toLine = (entry: Record<string, unknown>): string =>
  `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`

export const appendLog = async (
  path: string,
  entry: Record<string, unknown>,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, toLine(entry), 'utf8')
}
