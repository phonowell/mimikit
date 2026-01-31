declare module 'wink-bm25-text-search' {
  type PrepTask = (text: string) => string[]

  type SearchResult = { id: number; score: number }

  type Engine = {
    defineConfig: (config: {
      fldWeights: Record<string, number>
      bm25Params?: { k1?: number; b?: number }
    }) => void
    definePrepTasks: (tasks: PrepTask[], field?: string) => void
    addDoc: (doc: Record<string, unknown>, id: number) => void
    consolidate: () => void
    search: (query: string, limit?: number) => SearchResult[]
  }

  const bm25: () => Engine
  export default bm25
}
