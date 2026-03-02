import { readTextFileIfExists } from '../fs/read-text.js'

export const readMemoryMarkdown = async (memoryPath: string): Promise<string> =>
  readTextFileIfExists(memoryPath)
