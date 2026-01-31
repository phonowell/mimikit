import { createServer } from 'node:http'

import { handleRequest } from './handler.js'
import { respond } from './utils.js'

import type { Supervisor } from '../supervisor/supervisor.js'

export const createHttpServer = (supervisor: Supervisor, port: number) => {
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(supervisor, req, res)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      respond(res, 500, { error: message })
    }
  })

  server.listen(port, () => {
    console.log(`[http] listening on http://localhost:${port}`)
  })

  return server
}
