declare module 'fs-extra' {
  export type WriteFileOptions = {
    encoding?: BufferEncoding | null
    mode?: number
    flag?: string
  }
}
