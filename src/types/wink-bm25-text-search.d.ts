declare module 'wink-bm25-text-search' {
  export type Bm25Config = {
    fldWeights: Record<string, number>
    ovFldNames?: string[]
    bm25Params?: {
      k1?: number
      b?: number
      k?: number
    }
  }

  export type Bm25PrepTask = (value: string) => string[]

  export type Bm25Filter<TParams = unknown> = (
    doc: Record<string, unknown>,
    params: TParams,
  ) => boolean

  export type Bm25SearchEngine = {
    defineConfig: (config: Bm25Config) => void
    definePrepTasks: (tasks: Bm25PrepTask[], field?: string) => number
    addDoc: (doc: Record<string, unknown>, uniqueId: string | number) => void
    consolidate: (fp?: number) => void
    search: <TParams = unknown>(
      text: string,
      limit?: number,
      filter?: Bm25Filter<TParams>,
      params?: TParams,
    ) => Array<[string | number, number]>
    reset: () => void
  }

  const bm25: () => Bm25SearchEngine
  export default bm25
}
