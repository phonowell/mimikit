import { readTextFileIfExists } from '../fs/read-text.js'

export const readMemoryMarkdown = (memoryPath: string): Promise<string> =>
  readTextFileIfExists(memoryPath)
