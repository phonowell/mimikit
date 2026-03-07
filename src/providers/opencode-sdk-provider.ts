import { spawn } from 'node:child_process'

import { createOpencodeClient } from '@opencode-ai/sdk'

import { attachProviderThreadId } from '../shared/provider-thread-id.js'
import { newId } from '../shared/utils.js'

import {
  buildProviderAbortedError,
  buildProviderCircuitOpenError,
  buildProviderPreflightError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
  ProviderError,
} from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createTimeoutGuard,
} from './provider-runtime.js'

import type {
  OpencodeSdkProviderRequest,
  Provider,
  ProviderResult,
} from './types.js'
import type { OpencodeClient, ProviderConfig, Session } from '@opencode-ai/sdk'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

const PROVIDER_ID = 'opencode-sdk' as const
const MODEL_PROVIDER_ID = 'opencode' as const
const DEFAULT_AGENT = 'build'
const POLL_INTERVAL_MS = 350

const OPENCODE_SERVER_START_TIMEOUT_MS = 8_000
const OPENCODE_SERVER_SHUTDOWN_GRACE_MS = 2_000
const OPENCODE_SERVER_SHUTDOWN_FORCE_MS = 2_000
const SERVER_PORT_MIN = 42_100
const SERVER_PORT_MAX = 42_999
const OPENCODE_SERVER_IDLE_TTL_MS = 5 * 60 * 1_000

type Usage = ProviderResult['usage']

type SharedServerRef = {
  childId: string
  port?: number
  client: OpencodeClient
  close: () => Promise<void>
  refCount: number
  closing?: Promise<void>
  idleTimer?: ReturnType<typeof setTimeout>
}

const serverRefByKey = new Map<string, SharedServerRef>()
const pendingServerByKey = new Map<string, Promise<SharedServerRef>>()
const reservedServerPorts = new Set<number>()

const toServerKey = (
  workDir: string,
  proxy: string | undefined,
  model: string,
): string => `${workDir}\n${proxy ?? ''}\n${model}`

const normalizeModel = (model: string | undefined): string => {
  const trimmed = model?.trim()
  if (!trimmed) {
    throw buildProviderPreflightError({
      providerId: PROVIDER_ID,
      message: 'model is missing',
    })
  }
  if (trimmed.includes('/')) return trimmed
  return `${MODEL_PROVIDER_ID}/${trimmed}`
}

const parseModel = (model: string): { providerID: string; modelID: string } => {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash >= model.length - 1) {
    throw buildProviderPreflightError({
      providerId: PROVIDER_ID,
      message: `model is invalid: ${model}`,
    })
  }
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

const asString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const resolveProxyUrl = (proxy: string | undefined): string | undefined => {
  const trimmed = proxy?.trim()
  if (!trimmed) return undefined
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw buildProviderPreflightError({
      providerId: PROVIDER_ID,
      message: `proxy is invalid: ${trimmed}`,
    })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw buildProviderPreflightError({
      providerId: PROVIDER_ID,
      message: `proxy protocol is invalid: ${parsed.protocol}`,
    })
  }
  return parsed.toString()
}

const parsePortFromUrl = (url: string): number | undefined => {
  try {
    const parsed = new URL(url)
    const raw = parsed.port
    if (!raw) return undefined
    const port = Number.parseInt(raw, 10)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}

const reserveServerPort = (excludedPorts?: ReadonlySet<number>): number => {
  for (let port = SERVER_PORT_MIN; port <= SERVER_PORT_MAX; port += 1) {
    if (excludedPorts?.has(port)) continue
    if (reservedServerPorts.has(port)) continue
    reservedServerPorts.add(port)
    return port
  }
  throw buildProviderPreflightError({
    providerId: PROVIDER_ID,
    message: 'no opencode server port available',
  })
}

const releaseServerPort = (port: number | undefined): void => {
  if (port === undefined) return
  reservedServerPorts.delete(port)
}

const readSdkErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  const record = asRecord(error)
  if (!record) return String(error)
  const name = asString(record.name)
  const data = asRecord(record.data)
  const dataMessage = asString(data?.message)
  const message = asString(record.message) ?? dataMessage
  if (name && message) return `${name}: ${message}`
  if (message) return message
  try {
    return JSON.stringify(record)
  } catch {
    return String(error)
  }
}

const isPortBusyError = (error: unknown): boolean => {
  const message = readSdkErrorMessage(error)
  return /failed to start server on port|eaddrinuse|address already in use/i.test(
    message,
  )
}

const clearIdleTimer = (ref: SharedServerRef): void => {
  if (!ref.idleTimer) return
  clearTimeout(ref.idleTimer)
  delete ref.idleTimer
}

const waitForProcessExit = (params: {
  proc: ChildProcessWithoutNullStreams
  timeoutMs: number
}): Promise<boolean> => {
  if (params.proc.exitCode !== null) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let done = false
    const finish = (exited: boolean): void => {
      if (done) return
      done = true
      clearTimeout(timerId)
      params.proc.off('exit', handleExit)
      resolve(exited)
    }
    const handleExit = (): void => {
      finish(true)
    }
    const timerId = setTimeout(() => {
      finish(false)
    }, params.timeoutMs)
    params.proc.on('exit', handleExit)
  })
}

const terminateServerProcess = async (params: {
  proc: ChildProcessWithoutNullStreams
}): Promise<void> => {
  if (params.proc.exitCode !== null) return
  params.proc.kill('SIGTERM')
  const exitedByTerm = await waitForProcessExit({
    proc: params.proc,
    timeoutMs: OPENCODE_SERVER_SHUTDOWN_GRACE_MS,
  })
  if (exitedByTerm) return
  params.proc.kill('SIGKILL')
  await waitForProcessExit({
    proc: params.proc,
    timeoutMs: OPENCODE_SERVER_SHUTDOWN_FORCE_MS,
  })
}

const spawnOpencodeServerProcess = (params: {
  port: number
  config: Record<string, unknown>
}): Promise<{ url: string; proc: ChildProcessWithoutNullStreams }> => {
  const proc = spawn(
    'opencode',
    ['serve', '--hostname=127.0.0.1', `--port=${params.port}`],
    {
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(params.config),
      },
    },
  )
  return new Promise<{
    url: string
    proc: ChildProcessWithoutNullStreams
  }>((resolve, reject) => {
    let done = false
    let output = ''
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timerId)
      proc.stdout.off('data', handleStdout)
      proc.stderr.off('data', handleStderr)
      proc.off('exit', handleExit)
      proc.off('error', handleError)
      fn()
    }
    const fail = (error: unknown): void => {
      const resolved = error instanceof Error ? error : new Error(String(error))
      finish(() => {
        reject(resolved)
      })
    }
    const handleStdout = (chunk: Buffer | string): void => {
      output += chunk.toString()
      const lines = output.split('\n')
      for (const line of lines) {
        if (!line.startsWith('opencode server listening')) continue
        const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
        if (!match) {
          fail(new Error(`Failed to parse server url from output: ${line}`))
          return
        }
        const url = match[1]
        if (!url) {
          fail(new Error(`Failed to parse server url from output: ${line}`))
          return
        }
        finish(() => {
          resolve({ url, proc })
        })
        return
      }
    }
    const handleStderr = (chunk: Buffer | string): void => {
      output += chunk.toString()
    }
    const handleExit = (code: number | null): void => {
      let message = `Server exited with code ${code}`
      const trimmed = output.trim()
      if (trimmed.length > 0) message += `\nServer output: ${trimmed}`
      fail(new Error(message))
    }
    const handleError = (error: Error): void => {
      fail(error)
    }
    const timerId = setTimeout(() => {
      fail(
        new Error(
          `Timeout waiting for server to start after ${OPENCODE_SERVER_START_TIMEOUT_MS}ms`,
        ),
      )
    }, OPENCODE_SERVER_START_TIMEOUT_MS)
    proc.stdout.on('data', handleStdout)
    proc.stderr.on('data', handleStderr)
    proc.on('exit', handleExit)
    proc.on('error', handleError)
  })
}

const disposeSharedServerNow = async (params: {
  key: string
  ref: SharedServerRef
}): Promise<void> => {
  const current = serverRefByKey.get(params.key)
  if (!current || current !== params.ref) return
  if (current.refCount > 0) return
  if (current.closing) {
    await current.closing
    return
  }
  serverRefByKey.delete(params.key)
  const closing = (async (): Promise<void> => {
    try {
      await current.close()
    } finally {
      releaseServerPort(current.port)
    }
  })()
  current.closing = closing
  try {
    await closing
  } finally {
    if (current.closing === closing) delete current.closing
  }
}

const scheduleServerDispose = (params: {
  key: string
  ref: SharedServerRef
}): void => {
  clearIdleTimer(params.ref)
  params.ref.idleTimer = setTimeout(() => {
    void disposeSharedServerNow({
      key: params.key,
      ref: params.ref,
    })
  }, OPENCODE_SERVER_IDLE_TTL_MS)
}

const buildProviderConfig = (params: {
  model: string
  proxy?: string
}): {
  model: string
  config: {
    model: string
    provider?: Record<string, ProviderConfig>
    agent: {
      [key: string]: {
        permission: {
          '*': 'allow'
          doom_loop: 'allow'
          external_directory: 'allow'
        }
      }
    }
  }
} => {
  const proxy = resolveProxyUrl(params.proxy)
  const model = normalizeModel(params.model)
  const modelSpec = parseModel(model)
  const providerConfig: ProviderConfig = {
    options: {
      ...(proxy ? { baseURL: proxy } : {}),
    },
  }
  const hasProviderOptions =
    providerConfig.options !== undefined &&
    Object.keys(providerConfig.options).length > 0
  return {
    model,
    config: {
      model,
      ...(hasProviderOptions
        ? {
            provider: {
              [modelSpec.providerID]: providerConfig,
            },
          }
        : {}),
      agent: {
        [DEFAULT_AGENT]: {
          permission: {
            '*': 'allow',
            doom_loop: 'allow',
            external_directory: 'allow',
          },
        },
      },
    },
  }
}

const createSharedServer = async (params: {
  workDir: string
  model: string
  proxy?: string
  onServerStarted?: (child: {
    id: string
    kind: 'opencode-server'
    pid: number
    meta?: Record<string, unknown>
  }) => Promise<void>
}): Promise<SharedServerRef> => {
  const provider = buildProviderConfig({
    model: params.model,
    ...(params.proxy ? { proxy: params.proxy } : {}),
  })
  const excludedPorts = new Set<number>()
  for (;;) {
    const port = reserveServerPort(excludedPorts)
    let spawnedProc: ChildProcessWithoutNullStreams | undefined
    try {
      const spawned = await spawnOpencodeServerProcess({
        port,
        config: provider.config,
      })
      spawnedProc = spawned.proc
      const client = createOpencodeClient({
        baseUrl: spawned.url,
        directory: params.workDir,
      })
      const ref: SharedServerRef = {
        childId: `runtime-${newId()}`,
        port,
        client,
        close: async () => {
          try {
            await client.instance.dispose({
              throwOnError: true,
            })
          } catch (error) {
            const message = readSdkErrorMessage(error)
            if (!isTransientProviderMessage(message)) {
              // ignore dispose failures; process termination below is authoritative
            }
          }
          await terminateServerProcess({
            proc: spawned.proc,
          })
        },
        refCount: 1,
      }
      const parsedPort = parsePortFromUrl(spawned.url)
      if (parsedPort !== undefined) ref.port = parsedPort
      await params.onServerStarted?.({
        id: ref.childId,
        kind: 'opencode-server',
        pid: spawned.proc.pid ?? -1,
        meta: {
          model: params.model,
          url: spawned.url,
          ...(ref.port !== undefined ? { port: ref.port } : {}),
        },
      })
      return ref
    } catch (error) {
      if (spawnedProc) {
        try {
          await terminateServerProcess({ proc: spawnedProc })
        } catch {
          // swallow cleanup errors in startup path
        }
      }
      releaseServerPort(port)
      if (isPortBusyError(error)) {
        excludedPorts.add(port)
        continue
      }
      throw error
    }
  }
}

const getOrCreateSharedServer = async (params: {
  workDir: string
  model: string
  proxy?: string
  onServerStarted?: (child: {
    id: string
    kind: 'opencode-server'
    pid: number
    meta?: Record<string, unknown>
  }) => Promise<void>
}): Promise<SharedServerRef> => {
  const key = toServerKey(params.workDir, params.proxy, params.model)
  const existing = serverRefByKey.get(key)
  if (existing) {
    clearIdleTimer(existing)
    existing.refCount += 1
    return existing
  }

  const pending = pendingServerByKey.get(key)
  if (pending) {
    const resolved = await pending
    clearIdleTimer(resolved)
    resolved.refCount += 1
    return resolved
  }

  const createPromise = createSharedServer(params)
  pendingServerByKey.set(key, createPromise)
  try {
    const created = await createPromise
    serverRefByKey.set(key, created)
    return created
  } finally {
    pendingServerByKey.delete(key)
  }
}

const releaseSharedServer = (params: {
  workDir: string
  model: string
  proxy?: string
}): void => {
  const key = toServerKey(params.workDir, params.proxy, params.model)
  const current = serverRefByKey.get(key)
  if (!current) return
  current.refCount = Math.max(0, current.refCount - 1)
  if (current.refCount > 0) return
  scheduleServerDispose({ key, ref: current })
}

const usageEquals = (left: Usage, right: Usage): boolean => {
  if (!left && !right) return true
  if (!left || !right) return false
  return (
    left.input === right.input &&
    left.output === right.output &&
    left.total === right.total &&
    left.inputCacheRead === right.inputCacheRead &&
    left.inputCacheWrite === right.inputCacheWrite
  )
}

const parseUsage = (info: unknown): Usage => {
  const record = asRecord(info)
  if (!record) return undefined
  const tokens = asRecord(record.tokens)
  if (!tokens) return undefined
  const cache = asRecord(tokens.cache)
  const input = asNumber(tokens.input)
  const output = asNumber(tokens.output)
  const total = asNumber(tokens.total)
  const inputCacheRead = asNumber(cache?.read)
  const inputCacheWrite = asNumber(cache?.write)
  if (
    input === undefined &&
    output === undefined &&
    total === undefined &&
    inputCacheRead === undefined &&
    inputCacheWrite === undefined
  )
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(inputCacheRead !== undefined ? { inputCacheRead } : {}),
    ...(inputCacheWrite !== undefined ? { inputCacheWrite } : {}),
  }
}

type AssistantMessageView = {
  createdAt?: number
  completedAt?: number
  text: string
  usage?: Usage
}

const parseAssistantMessage = (
  value: unknown,
): AssistantMessageView | undefined => {
  const record = asRecord(value)
  if (!record) return undefined
  const info = asRecord(record.info)
  if (asString(info?.role) !== 'assistant') return undefined
  const time = asRecord(info?.time)
  const createdAt = asNumber(time?.created)
  const completedAt = asNumber(time?.completed)
  const { parts } = record
  let text = ''
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const partRecord = asRecord(part)
      if (asString(partRecord?.type) !== 'text') continue
      text +=
        partRecord?.text && typeof partRecord.text === 'string'
          ? partRecord.text
          : ''
    }
  }
  const usage = parseUsage(info)
  return {
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    text: text.trim(),
    ...(usage ? { usage } : {}),
  }
}

const pickLatestAssistantMessage = (
  messages: unknown,
  startedAtMs: number,
): AssistantMessageView | undefined => {
  if (!Array.isArray(messages)) return undefined
  let latest: AssistantMessageView | undefined
  for (const item of messages) {
    const parsed = parseAssistantMessage(item)
    if (!parsed) continue
    const created = parsed.createdAt ?? 0
    if (created < startedAtMs - 1_000) continue
    if (!latest) {
      latest = parsed
      continue
    }
    if ((latest.createdAt ?? 0) <= created) latest = parsed
  }
  return latest
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const toProviderError = (params: {
  error: unknown
  timeoutMs: number
  timedOut: boolean
  externallyAborted: boolean
}): ProviderError => {
  const { error, timeoutMs, timedOut, externallyAborted } = params
  if (timedOut) return buildProviderTimeoutError(PROVIDER_ID, timeoutMs)
  const message = readSdkErrorMessage(error)
  if (/no opencode server port available/i.test(message))
    return buildProviderCircuitOpenError(PROVIDER_ID)
  if (
    externallyAborted ||
    (error instanceof Error && error.name === 'AbortError') ||
    /aborted|canceled|cancelled/i.test(message)
  )
    return buildProviderAbortedError(PROVIDER_ID)
  return buildProviderSdkError({
    providerId: PROVIDER_ID,
    message,
    transient: isTransientProviderMessage(message),
  })
}

const ensureSession = async (params: {
  client: OpencodeClient
  requestedSessionId?: string
  signal: AbortSignal
}): Promise<Session> => {
  if (!params.requestedSessionId) {
    const created = await params.client.session.create({
      throwOnError: true,
      signal: params.signal,
    })
    return created.data
  }

  const found = await params.client.session.get({
    path: { id: params.requestedSessionId },
    throwOnError: true,
    signal: params.signal,
  })
  return found.data
}

const resolveSessionStatus = (
  data: unknown,
  sessionId: string,
): string | undefined => {
  const map = asRecord(data)
  const status = asRecord(map?.[sessionId])
  return asString(status?.type)
}

const normalizeThreadId = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const runOpencodeProvider = async (
  request: OpencodeSdkProviderRequest,
): Promise<ProviderResult> => {
  const model = normalizeModel(request.model)
  const modelSpec = parseModel(model)
  const startedAt = Date.now()
  const controller = new AbortController()
  let externallyAborted = false
  let timedOut = false
  const releaseExternalAbort = bindExternalAbort({
    controller,
    ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
    onAbort: () => {
      externallyAborted = true
    },
  })
  const timeout = createTimeoutGuard({
    controller,
    timeoutMs: request.timeoutMs,
    onTimeout: () => {
      timedOut = true
    },
  })

  let sessionId: string | undefined
  let shared: SharedServerRef | undefined

  try {
    shared = await getOrCreateSharedServer({
      workDir: request.workDir,
      model,
      ...(request.proxy ? { proxy: request.proxy } : {}),
      ...(request.onRuntimeChildStarted
        ? { onServerStarted: request.onRuntimeChildStarted }
        : {}),
    })
    timeout.arm()
    const requestedSessionId = normalizeThreadId(request.threadId ?? undefined)
    const session = await ensureSession({
      client: shared.client,
      ...(requestedSessionId ? { requestedSessionId } : {}),
      signal: controller.signal,
    })
    sessionId = session.id

    await shared.client.session.promptAsync({
      path: { id: session.id },
      body: {
        agent: DEFAULT_AGENT,
        model: {
          providerID: modelSpec.providerID,
          modelID: modelSpec.modelID,
        },
        parts: [{ type: 'text', text: request.prompt }],
      },
      throwOnError: true,
      signal: controller.signal,
    })

    let latestText = ''
    let latestUsage: Usage

    for (;;) {
      if (controller.signal.aborted)
        throw buildProviderAbortedError(PROVIDER_ID)
      timeout.arm()

      const messagesResponse = await shared.client.session.messages({
        path: { id: session.id },
        throwOnError: true,
        signal: controller.signal,
      })
      const latestAssistant = pickLatestAssistantMessage(
        messagesResponse.data,
        startedAt,
      )
      if (latestAssistant) {
        if (
          latestAssistant.text.length > 0 &&
          latestAssistant.text !== latestText
        ) {
          latestText = latestAssistant.text
          request.onPartialOutput?.(latestText)
        }
        if (!usageEquals(latestUsage, latestAssistant.usage)) {
          latestUsage = latestAssistant.usage
          if (latestUsage) request.onUsage?.(latestUsage)
        }
        if (latestAssistant.completedAt !== undefined) {
          return buildProviderResult({
            startedAt,
            output: latestText,
            ...(latestUsage ? { usage: latestUsage } : {}),
            threadId: session.id,
          })
        }
      }

      const statusResponse = await shared.client.session.status({
        throwOnError: true,
        signal: controller.signal,
      })
      const statusType = resolveSessionStatus(statusResponse.data, session.id)
      if (statusType === 'idle') {
        if (!latestAssistant) {
          await sleep(POLL_INTERVAL_MS)
          continue
        }
        return buildProviderResult({
          startedAt,
          output: latestText,
          ...(latestUsage ? { usage: latestUsage } : {}),
          threadId: session.id,
        })
      }

      await sleep(POLL_INTERVAL_MS)
    }
  } catch (error) {
    const mappedError =
      error instanceof ProviderError
        ? error
        : toProviderError({
            error,
            timeoutMs: request.timeoutMs,
            timedOut,
            externallyAborted,
          })
    throw attachProviderThreadId(mappedError, sessionId ?? null)
  } finally {
    timeout.clear()
    releaseExternalAbort()
    if (shared) {
      if (shared.refCount <= 1 && request.onRuntimeChildStopped)
        await request.onRuntimeChildStopped(shared.childId)
      releaseSharedServer({
        workDir: request.workDir,
        model,
        ...(request.proxy ? { proxy: request.proxy } : {}),
      })
    }
  }
}

export const opencodeSdkProvider: Provider<OpencodeSdkProviderRequest> = {
  id: PROVIDER_ID,
  run: runOpencodeProvider,
}
