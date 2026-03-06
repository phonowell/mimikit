import { readTextFileIfExists } from '../fs/read-text.js'

export {
  formatMemoryEntriesMarkdown,
  parseMemoryEntries,
  readMemoryEntries,
  writeMemoryEntries,
} from './entry-codec.js'

export const readMemoryMarkdown = (memoryPath: string): Promise<string> =>
  readTextFileIfExists(memoryPath)
