export type MemoryHit = {
  path: string
  line: number
  text: string
}

export type MemoryConfig = {
  workDir: string
  memoryPaths?: string[] | undefined
  maxHits?: number | undefined
  maxChars?: number | undefined
}
