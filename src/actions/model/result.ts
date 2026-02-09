export type Result = {
  ok: boolean
  output: string
  error?: string
  details?: Record<string, unknown>
}
