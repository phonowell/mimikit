import { getFocusSnapshot } from '../../focus/state.js'
import { appendLog } from '../../log/append.js'
import { newId, nowIso } from '../../shared/utils.js'
import { readHistory } from '../../storage/history-jsonl.js'
import { publishUserInput } from '../../streams/queues.js'
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

const USER_META_STRING_KEYS = [
  'source',
  'remote',
  'userAgent',
  'language',
  'clientLocale',
  'clientTimeZone',
  'clientNowIso',
] as const

const toUserInputLogMeta = (meta?: UserMeta): Partial<UserMeta> => {
  if (!meta) return {}
  const output: Partial<UserMeta> = {}
  for (const key of USER_META_STRING_KEYS) {
    const value = meta[key]
    if (value) output[key] = value
  }
  if (meta.clientOffsetMinutes !== undefined)
    output.clientOffsetMinutes = meta.clientOffsetMinutes

  return output
}

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
  runtime.inflightInputs.push(input)
  if (meta) runtime.lastUserMeta = meta
  await appendLog(runtime.paths.log, {
    event: 'user_input',
    id,
    ...(quote ? { quote } : {}),
    ...toUserInputLogMeta(meta),
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
  focuses: ReturnType<typeof getFocusSnapshot>
  stream: RuntimeState['uiStream']
}> => {
  const messages = await getChatMessages(runtime, messageLimit)
  return {
    status: getStatus(),
    messages,
    tasks: getTasks(runtime, taskLimit),
    focuses: getFocusSnapshot(runtime),
    stream: runtime.uiStream ? { ...runtime.uiStream } : null,
  }
}

export const waitForWebUiSignal = (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => waitForUiSignal(runtime, timeoutMs)
