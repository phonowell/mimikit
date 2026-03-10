import { createServer } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { openAiResponsesProvider } from '../src/providers/openai-responses-provider.js'

let activeServer: ReturnType<typeof createServer> | null = null

const closeActiveServer = async (): Promise<void> => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => {
    activeServer?.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  activeServer = null
}

afterEach(async () => {
  await closeActiveServer()
})

describe('openAiResponsesProvider', () => {
  it('does not send cache_control inside responses input_text content', async () => {
    let requestBody = ''
    activeServer = createServer((req, res) => {
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        requestBody += chunk
      })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'ok' }],
              },
            ],
          }),
        )
      })
    })

    const serverUrl = await new Promise<string>((resolve, reject) => {
      activeServer?.listen(0, '127.0.0.1', () => {
        const address = activeServer?.address()
        if (!address || typeof address === 'string') {
          reject(new Error('server address unavailable'))
          return
        }
        resolve(`http://127.0.0.1:${address.port}`)
      })
      activeServer?.on('error', reject)
    })

    const result = await openAiResponsesProvider.run({
      provider: 'openai-responses',
      role: 'manager',
      prompt: 'fallback prompt',
      promptSegments: [
        { text: 'segment-a', cacheControl: 'ephemeral' },
        { text: 'segment-b' },
      ],
      workDir: process.cwd(),
      timeoutMs: 5_000,
      baseUrl: serverUrl,
      apiKey: 'test-key',
      model: 'gpt-5.2',
    })

    const payload = JSON.parse(requestBody) as {
      input?: Array<{
        content?: Array<Record<string, unknown>>
      }>
    }

    expect(result.output).toBe('ok')
    expect(payload.input).toHaveLength(2)
    expect(payload.input?.[0]?.content?.[0]).toEqual({
      type: 'input_text',
      text: 'segment-a',
    })
    expect(payload.input?.[1]?.content?.[0]).toEqual({
      type: 'input_text',
      text: 'segment-b',
    })
  })
})
