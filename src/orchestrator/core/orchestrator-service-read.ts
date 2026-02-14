import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { newId, nowIso } from '../../shared/utils.js'
import { readHistory } from '../../storage/jsonl.js'
import { publishUserInput, publishWakeEvent } from '../../streams/queues.js'
import {
  type ChatMessage,
  type ChatMessagesMode,
  mergeChatMessages,
  selectChatMessages,
} from '../read-model/chat-view.js'
import { buildTaskViews } from '../read-model/task-view.js'

import { notifyManagerLoop } from './manager-signal.js'
import { waitForUiSignal } from './ui-signal.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

export const addUserInput = async (
  runtime: RuntimeState,
  text: string,
  meta?: UserMeta,
  quote?: string,
): Promise<string> => {
  const id = newId()
  const createdAt = nowIso()
  const input = quote ? { id, text, createdAt, quote } : { id, text, createdAt }
  await publishUserInput({
    paths: runtime.paths,
    payload: input,
  })
  await bestEffort('publishWakeEvent: user_input', () =>
    publishWakeEvent({
      paths: runtime.paths,
      payload: {
        type: 'user_input',
        inputId: id,
        createdAt,
      },
    }),
  )
  runtime.inflightInputs.push(input)
  if (meta) runtime.lastUserMeta = meta
  await appendLog(runtime.paths.log, {
    event: 'user_input',
    id,
    ...(quote ? { quote } : {}),
    ...(meta?.source ? { source: meta.source } : {}),
    ...(meta?.remote ? { remote: meta.remote } : {}),
    ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}),
    ...(meta?.language ? { language: meta.language } : {}),
    ...(meta?.clientLocale ? { clientLocale: meta.clientLocale } : {}),
    ...(meta?.clientTimeZone ? { clientTimeZone: meta.clientTimeZone } : {}),
    ...(meta?.clientOffsetMinutes !== undefined
      ? { clientOffsetMinutes: meta.clientOffsetMinutes }
      : {}),
    ...(meta?.clientNowIso ? { clientNowIso: meta.clientNowIso } : {}),
  })
  notifyManagerLoop(runtime)
  return id
}

export const getInflightInputs = (runtime: RuntimeState) => [
  ...runtime.inflightInputs,
]

export const getChatHistory = async (
  runtime: RuntimeState,
  limit = 50,
): Promise<ChatMessage[]> => {
  const history = await readHistory(runtime.paths.history)
  return mergeChatMessages({
    history,
    inflightInputs: getInflightInputs(runtime),
    limit,
  })
}

export const getChatMessages = async (
  runtime: RuntimeState,
  limit = 50,
  afterId?: string,
): Promise<{ messages: ChatMessage[]; mode: ChatMessagesMode }> => {
  const history = await readHistory(runtime.paths.history)
  return selectChatMessages({
    history,
    inflightInputs: getInflightInputs(runtime),
    limit,
    ...(afterId ? { afterId } : {}),
  })
}

export const getTasks = (runtime: RuntimeState, limit = 200) =>
  buildTaskViews(runtime.tasks, runtime.cronJobs, limit)

export const getWebUiSnapshot = async (
  runtime: RuntimeState,
  getStatus: () => unknown,
  messageLimit = 50,
  taskLimit = 200,
): Promise<{
  status: unknown
  messages: Awaited<ReturnType<typeof getChatMessages>>
  tasks: ReturnType<typeof getTasks>
  stream: RuntimeState['uiStream']
}> => {
  const [messages, tasks] = await Promise.all([
    getChatMessages(runtime, messageLimit),
    Promise.resolve(getTasks(runtime, taskLimit)),
  ])
  const stream = runtime.uiStream
  return {
    status: getStatus(),
    messages,
    tasks,
    stream: stream
      ? {
          id: stream.id,
          role: stream.role,
          text: stream.text,
          ...(stream.usage ? { usage: stream.usage } : {}),
          createdAt: stream.createdAt,
          updatedAt: stream.updatedAt,
        }
      : null,
  }
}

export const waitForWebUiSignal = (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => waitForUiSignal(runtime, timeoutMs)
