import { z } from 'zod'

import { buildPaths } from '../../fs/paths.js'
import { appendLog } from '../../log/append.js'
import { nowIso } from '../../shared/utils.js'

import { buildQqValidationSignature, verifyQqCallbackSignature } from './signature.js'
import { registerQqInboundMessage } from './state.js'

import type { AppConfig } from '../../config.js'
import type { Orchestrator } from '../../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

const QQ_DISPATCH_OPCODE = 0
const QQ_ACK_OPCODE = 12
const QQ_VALIDATION_OPCODE = 13
const C2C_EVENT_TYPE = 'C2C_MESSAGE_CREATE'

const qqPayloadSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    op: z.number().int(),
    t: z.string().trim().min(1).optional(),
    d: z.unknown().optional(),
  })
  .strict()

const validationDataSchema = z
  .object({ plain_token: z.string().trim().min(1), event_ts: z.string().trim().min(1) })
  .strict()

const c2cMessageSchema = z
  .object({
    id: z.string().trim().min(1),
    content: z.string(),
    timestamp: z.string().trim().min(1).optional(),
    author: z.object({ user_openid: z.string().trim().min(1) }).strict(),
  })
  .strict()

const normalizeCallbackPath = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return '/api/qq/events'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const buildDispatchAck = (success: boolean): { op: number; d: number } => ({
  op: QQ_ACK_OPCODE,
  d: success ? 0 : 1,
})

const parsePayload = (rawBody: string): z.infer<typeof qqPayloadSchema> | undefined => {
  try {
    const json = JSON.parse(rawBody) as unknown
    const parsed = qqPayloadSchema.safeParse(json)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export const registerQqWebhookRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  const callbackPath = normalizeCallbackPath(config.qq.callbackPath)
  const logPath = buildPaths(config.workDir).log

  app.register(async (qqApp) => {
    qqApp.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, body, done) =>
      done(null, body),
    )

    qqApp.post(callbackPath, async (request, reply) => {
      if (typeof request.body !== 'string') {
        reply.code(400).send({ error: 'invalid body' })
        return
      }
      const rawBody = request.body

      if (config.qq.verifySign) {
        const verified = verifyQqCallbackSignature({
          appSecret: config.qq.appSecret,
          headers: request.headers,
          rawBody,
          clockSkewMs: config.qq.clockSkewMs,
        })
        if (!verified.ok) {
          await appendLog(logPath, {
            event: 'qq_signature_verification_failed',
            reason: verified.reason,
          })
          reply.code(401).send({ error: 'invalid signature' })
          return
        }
      }

      const payload = parsePayload(rawBody)
      if (!payload) {
        reply.code(200).send(buildDispatchAck(false))
        return
      }

      if (payload.op === QQ_VALIDATION_OPCODE) {
        const dataParsed = validationDataSchema.safeParse(payload.d)
        if (!dataParsed.success) {
          reply.code(400).send({ error: 'invalid validation payload' })
          return
        }
        reply.send({
          plain_token: dataParsed.data.plain_token,
          signature: buildQqValidationSignature({
            appSecret: config.qq.appSecret,
            eventTs: dataParsed.data.event_ts,
            plainToken: dataParsed.data.plain_token,
          }),
        })
        return
      }

      if (payload.op !== QQ_DISPATCH_OPCODE || payload.t !== C2C_EVENT_TYPE) {
        reply.code(200).send(buildDispatchAck(true))
        return
      }

      const c2cParsed = c2cMessageSchema.safeParse(payload.d)
      if (!c2cParsed.success) {
        reply.code(200).send(buildDispatchAck(false))
        return
      }
      const message = c2cParsed.data

      const registered = await registerQqInboundMessage({
        stateDir: config.workDir,
        ...(payload.id ? { eventId: payload.id } : {}),
        messageId: message.id,
        receivedAt: nowIso(),
      })
      if (!registered.ok) {
        reply.code(200).send(buildDispatchAck(true))
        return
      }

      const text = message.content.trim()
      if (!text) {
        reply.code(200).send(buildDispatchAck(true))
        return
      }

      await orchestrator.addUserInput(text, {
        source: 'qq',
        platform: 'qq',
        qqOpenid: message.author.user_openid,
        qqMessageId: message.id,
        ...(payload.id ? { qqEventId: payload.id } : {}),
        ...(message.timestamp ? { qqTimestamp: message.timestamp } : {}),
      })
      reply.code(200).send(buildDispatchAck(true))
    })
  })
}
