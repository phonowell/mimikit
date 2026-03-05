import { generateKeyPairSync, sign, verify } from 'node:crypto'

import type { KeyObject } from 'node:crypto'

const SIGNATURE_HEADER = 'x-signature-ed25519'
const TIMESTAMP_HEADER = 'x-signature-timestamp'
const ED25519_SEED_BYTES = 32

const generateEd25519KeyPair = generateKeyPairSync as unknown as (
  type: 'ed25519',
  options: { seed: Buffer },
) => { publicKey: KeyObject; privateKey: KeyObject }

const normalizeSecretSeed = (secret: string): Buffer => {
  let seed = secret
  while (seed.length < ED25519_SEED_BYTES) seed = `${seed}${seed}`
  return Buffer.from(seed.slice(0, ED25519_SEED_BYTES), 'utf8')
}

const deriveKeyPair = (
  secret: string,
): {
  publicKey: KeyObject
  privateKey: KeyObject
} => generateEd25519KeyPair('ed25519', { seed: normalizeSecretSeed(secret) })

const parseTimestamp = (value: string): number | undefined => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const decodeHexSignature = (value: string): Buffer | undefined => {
  try {
    const buf = Buffer.from(value, 'hex')
    return buf.byteLength === 64 ? buf : undefined
  } catch {
    return undefined
  }
}

const buildPayloadBuffer = (timestamp: string, body: string): Buffer =>
  Buffer.from(`${timestamp}${body}`, 'utf8')

export const verifyQqCallbackSignature = (params: {
  appSecret: string
  headers: Record<string, string | string[] | undefined>
  rawBody: string
  clockSkewMs: number
  nowMs?: number
}): { ok: true } | { ok: false; reason: string } => {
  const signatureHex = params.headers[SIGNATURE_HEADER]
  const timestampValue = params.headers[TIMESTAMP_HEADER]
  const signature =
    typeof signatureHex === 'string'
      ? decodeHexSignature(signatureHex)
      : undefined
  const timestamp =
    typeof timestampValue === 'string'
      ? parseTimestamp(timestampValue)
      : undefined
  if (!signature) return { ok: false, reason: 'invalid_signature_header' }
  if (!timestamp) return { ok: false, reason: 'invalid_timestamp_header' }
  const nowMs = params.nowMs ?? Date.now()
  if (Math.abs(nowMs - timestamp * 1000) > params.clockSkewMs)
    return { ok: false, reason: 'timestamp_out_of_range' }
  const payload = buildPayloadBuffer(String(timestamp), params.rawBody)
  const { publicKey } = deriveKeyPair(params.appSecret)
  return verify(null, payload, publicKey, signature)
    ? { ok: true }
    : { ok: false, reason: 'signature_mismatch' }
}

export const buildQqValidationSignature = (params: {
  appSecret: string
  eventTs: string
  plainToken: string
}): string => {
  const payload = buildPayloadBuffer(params.eventTs, params.plainToken)
  const { privateKey } = deriveKeyPair(params.appSecret)
  return sign(null, payload, privateKey).toString('hex')
}
