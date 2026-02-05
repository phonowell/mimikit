import { runBeadsJson } from './cli.js'
import { resolveBeadsConfig } from './config.js'
import { extractIssueId } from './normalize.js'

import type { BeadsCommand, BeadsCommandResult } from './types.js'

const readContent = (command: BeadsCommand): string | undefined => {
  const raw = command.content?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

const readAttr = (command: BeadsCommand, key: string): string | undefined => {
  const raw = command.attrs[key]
  return raw?.trim().length ? raw.trim() : undefined
}

const readListAttr = (command: BeadsCommand, key: string): string[] => {
  const raw = readAttr(command, key)
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export const executeBeadsCommand = async (
  workDir: string,
  command: BeadsCommand,
): Promise<BeadsCommandResult> => {
  const config = await resolveBeadsConfig(workDir)
  if (!config) {
    return {
      action: command.action,
      ok: false,
      error: 'beads disabled',
    }
  }
  try {
    switch (command.action) {
      case 'beads_create': {
        const title = readAttr(command, 'title')
        if (!title) {
          return {
            action: command.action,
            ok: false,
            error: 'missing title',
          }
        }
        const args = ['create', title]
        const issueType = readAttr(command, 'type')
        if (issueType) args.push('-t', issueType)
        const priority = readAttr(command, 'priority')
        if (priority) args.push('-p', priority)
        const description =
          readContent(command) ?? readAttr(command, 'description')
        if (description) args.push('-d', description)
        const assignee = readAttr(command, 'assignee')
        if (assignee) args.push('--assignee', assignee)
        const labels = readAttr(command, 'labels')
        if (labels) args.push('--labels', labels)
        const parent = readAttr(command, 'parent')
        if (parent) args.push('--parent', parent)
        const deps = readAttr(command, 'deps')
        if (deps) args.push('--deps', deps)
        const specId = readAttr(command, 'spec_id')
        if (specId) args.push('--spec-id', specId)
        const output = await runBeadsJson(config, args)
        const issueId = extractIssueId(output)
        return {
          action: command.action,
          ok: true,
          ...(issueId ? { issueId } : {}),
        }
      }
      case 'beads_update': {
        const id = readAttr(command, 'id')
        if (!id) {
          return {
            action: command.action,
            ok: false,
            error: 'missing id',
          }
        }
        const args = ['update', id]
        const status = readAttr(command, 'status')
        if (status) args.push('--status', status)
        const priority = readAttr(command, 'priority')
        if (priority) args.push('--priority', priority)
        const title = readAttr(command, 'title')
        if (title) args.push('--title', title)
        const description = readAttr(command, 'description')
        if (description) args.push('--description', description)
        const appendNotes =
          readContent(command) ?? readAttr(command, 'append_notes')
        if (appendNotes) args.push('--append-notes', appendNotes)
        const notes = appendNotes ? undefined : readAttr(command, 'notes')
        if (notes) args.push('--notes', notes)
        const acceptance = readAttr(command, 'acceptance')
        if (acceptance) args.push('--acceptance', acceptance)
        const addLabels = readListAttr(command, 'add_labels')
        if (addLabels.length > 0) args.push('--add-label', addLabels.join(','))
        const removeLabels = readListAttr(command, 'remove_labels')
        if (removeLabels.length > 0)
          args.push('--remove-label', removeLabels.join(','))
        const setLabels = readListAttr(command, 'set_labels')
        if (setLabels.length > 0) args.push('--set-labels', setLabels.join(','))
        const parent = readAttr(command, 'parent')
        if (parent) args.push('--parent', parent)
        const defer = readAttr(command, 'defer')
        if (defer) args.push('--defer', defer)
        const due = readAttr(command, 'due')
        if (due) args.push('--due', due)
        await runBeadsJson(config, args)
        return {
          action: command.action,
          ok: true,
          issueId: id,
        }
      }
      case 'beads_close': {
        const id = readAttr(command, 'id')
        if (!id) {
          return {
            action: command.action,
            ok: false,
            error: 'missing id',
          }
        }
        const args = ['close', id]
        const reason = readContent(command) ?? readAttr(command, 'reason')
        if (reason) args.push('--reason', reason)
        await runBeadsJson(config, args)
        return {
          action: command.action,
          ok: true,
          issueId: id,
        }
      }
      case 'beads_reopen': {
        const id = readAttr(command, 'id')
        if (!id) {
          return {
            action: command.action,
            ok: false,
            error: 'missing id',
          }
        }
        const args = ['reopen', id]
        const reason = readContent(command) ?? readAttr(command, 'reason')
        if (reason) args.push('--reason', reason)
        await runBeadsJson(config, args)
        return {
          action: command.action,
          ok: true,
          issueId: id,
        }
      }
      case 'beads_dep_add': {
        const from = readAttr(command, 'from')
        const to = readAttr(command, 'to')
        if (!from || !to) {
          return {
            action: command.action,
            ok: false,
            error: 'missing from/to',
          }
        }
        const args = ['dep', 'add', from, to]
        const depType = readAttr(command, 'type')
        if (depType) args.push('--type', depType)
        await runBeadsJson(config, args)
        return {
          action: command.action,
          ok: true,
        }
      }
      default:
        return {
          action: command.action,
          ok: false,
          error: 'unsupported beads command',
        }
    }
  } catch (error) {
    return {
      action: command.action,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
