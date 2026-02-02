import ollama from 'ollama'

export const runOllama = async (params: {
  model: string
  prompt: string
  timeoutMs: number
}): Promise<{ output: string; elapsedMs: number }> => {
  const startedAt = Date.now()
  const response = await ollama.generate({
    model: params.model,
    prompt: params.prompt,
    stream: false,
  })
  return {
    output: response.response,
    elapsedMs: Date.now() - startedAt,
  }
}
