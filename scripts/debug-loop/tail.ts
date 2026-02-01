import { open, stat } from 'node:fs/promises'

import type { LogEntry } from './types.js'

export const createLogTail = (
  logPath: string,
  onEntry: (entry: LogEntry) => Promise<void>,
) => {
  let offset = 0
  let carry = ''
  return async () => {
    let info
    try {
      info = await stat(logPath)
    } catch {
      return
    }
    if (info.size < offset) {
      offset = 0
      carry = ''
    }
    if (info.size === offset) return
    const handle = await open(logPath, 'r')
    const length = info.size - offset
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, offset)
    await handle.close()
    offset = info.size
    const data = carry + buffer.toString('utf8')
    const lines = data.split(/\r?\n/)
    carry = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const entry = JSON.parse(trimmed) as LogEntry
        await onEntry(entry)
      } catch {
        // ignore malformed line
      }
    }
  }
}
