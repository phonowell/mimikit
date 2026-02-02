import { newId } from '../ids.js'
import { updateTask, writeTask } from '../storage/tasks.js'
import { appendTellerNotices } from '../storage/teller-notices.js'
import {
  readThinkerState,
  writeThinkerState,
} from '../storage/thinker-state.js'
import { appendUserInputs } from '../storage/user-inputs.js'
import { nowIso } from '../time.js'

import type { ParsedCommand } from './parser.js'
import type { StatePaths } from '../fs/paths.js'
import type { Task } from '../types/tasks.js'
import type { TellerNotice } from '../types/teller-notice.js'
import type { UserInput } from '../types/user-input.js'

export type PendingUserInput = {
  id: string
  text: string
  createdAt: string
}

export type CommandContext = {
  paths: StatePaths
  inputBuffer?: PendingUserInput[]
  now?: Date
}

const normalizePriority = (raw: string | undefined, fallback = 5): number => {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  return Math.min(10, Math.max(1, rounded))
}

const parseBlockedBy = (raw?: string): string[] | undefined => {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return []
  const parts = trimmed.split(',').map((part) => part.trim())
  const ids = parts.filter((part) => part.length > 0)
  return ids.length > 0 ? ids : []
}

export const executeCommands = async (
  commands: ParsedCommand[],
  ctx: CommandContext,
): Promise<void> => {
  let inputsRecorded = false
  for (const command of commands) {
    const { action } = command
    if (action === 'record_input') {
      if (inputsRecorded) continue
      if (!ctx.inputBuffer || ctx.inputBuffer.length === 0) continue
      const payload: UserInput[] = ctx.inputBuffer.map((input) => ({
        id: input.id,
        text: input.text,
        createdAt: input.createdAt,
        processedByThinker: false,
      }))
      await appendUserInputs(ctx.paths.userInputs, payload)
      inputsRecorded = true
      continue
    }

    if (action === 'dispatch_worker') {
      const prompt = command.attrs.prompt?.trim()
      if (!prompt) continue
      const blockedBy = parseBlockedBy(command.attrs.blocked_by)
      const task: Task = {
        id: newId(),
        prompt,
        priority: normalizePriority(command.attrs.priority, 5),
        status: 'queued',
        createdAt: nowIso(),
        ...(blockedBy ? { blockedBy } : {}),
        ...(command.attrs.scheduled_at
          ? { scheduledAt: command.attrs.scheduled_at }
          : {}),
      }
      await writeTask(ctx.paths.agentQueue, task)
      continue
    }

    if (action === 'cancel_task') {
      const id = command.attrs.id?.trim()
      if (!id) continue
      await updateTask(ctx.paths.agentQueue, id, (task) => ({
        ...task,
        status: 'cancelled',
      }))
      continue
    }

    if (action === 'update_task') {
      const id = command.attrs.id?.trim()
      if (!id) continue
      await updateTask(ctx.paths.agentQueue, id, (task) => {
        const next: Task = { ...task }
        if (command.attrs.priority) {
          next.priority = normalizePriority(
            command.attrs.priority,
            task.priority,
          )
        }
        if (command.attrs.blocked_by !== undefined)
          next.blockedBy = parseBlockedBy(command.attrs.blocked_by) ?? []
        return next
      })
      continue
    }

    if (action === 'notify_teller') {
      const message = command.content?.trim()
      if (!message) continue
      const notice: TellerNotice = {
        id: newId(),
        message,
        createdAt: nowIso(),
        processedByTeller: false,
      }
      await appendTellerNotices(ctx.paths.tellerNotices, [notice])
      continue
    }

    if (action === 'update_state') {
      const key = command.attrs.key?.trim()
      if (key !== 'notes') continue
      const content = command.content ?? ''
      const state = await readThinkerState(ctx.paths.thinkerState)
      const next = { ...state, notes: content }
      await writeThinkerState(ctx.paths.thinkerState, next)
    }
  }
}
