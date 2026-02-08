declare module 'fs-extra' {
  export type WriteFileOptions = {
    encoding?: BufferEncoding | null
    mode?: number
    flag?: string
  }

  export type ReadFileOptions = {
    encoding?: BufferEncoding | null
    flag?: string
  }

  export type MkdirOptions = {
    recursive?: boolean
    mode?: number
  }

  export type RemoveOptions = {
    maxRetries?: number
    retryDelay?: number
  }

  export type MoveOptions = {
    overwrite?: boolean
  }

  export type CopyOptions = {
    overwrite?: boolean
    errorOnExist?: boolean
    recursive?: boolean
  }

  export type PathExists = (path: string) => Promise<boolean>
}
