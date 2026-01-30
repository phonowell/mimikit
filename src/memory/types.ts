export type MemoryHit = {
  path: string
  line: number
  text: string
}

export type MemoryConfig = {
  workDir: string
  memoryPaths?: string[] | undefined
}
