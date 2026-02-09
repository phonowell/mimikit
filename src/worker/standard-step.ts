import { z } from 'zod'

import { parseActions, parseLooseLines } from '../actions/protocol/parse.js'
import { getInvokableSpec } from '../actions/registry/index.js'
import { parseArgs } from '../actions/shared/args.js'

import type { Parsed } from '../actions/model/parsed.js'
import type { InvokableName } from '../actions/registry/index.js'

export type StandardStep =
  | {
      kind: 'respond'
      response: string
    }
  | {
      kind: 'action'
      actionCall: {
        name: InvokableName
        args: Record<string, unknown>
      }
    }

const nonEmptyString = z.string().trim().min(1)

const respondSchema = z
  .object({
    response: nonEmptyString,
  })
  .strict()

const formatRespondError = (error: z.ZodError): string => {
  const issue = error.issues[0]
  if (!issue) return 'standard_action_args_invalid'
  if (issue.code === 'unrecognized_keys') {
    const key = issue.keys[0]
    if (key) return `standard_action_attr_invalid:${key}`
    return 'standard_action_args_invalid'
  }
  const head = issue.path[0]
  if (typeof head === 'string' && head.length > 0)
    return `standard_action_attr_invalid:${head}`
  return 'standard_action_args_invalid'
}

const formatActionError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'standard_action_args_invalid'
  if (error.message === 'action_args_invalid_json')
    return 'standard_action_args_invalid'
  if (error.message === 'action_args_invalid')
    return 'standard_action_args_invalid'
  if (error.message.startsWith('action_arg_invalid:')) {
    return error.message.replace(
      'action_arg_invalid:',
      'standard_action_attr_invalid:',
    )
  }

  return error.message
}

const parseActionStep = (item: Parsed): StandardStep => {
  const spec = getInvokableSpec(item.name)
  if (!spec) throw new Error(`standard_step_unknown_action:${item.name}`)
  try {
    const args = parseArgs(item.attrs, spec.schema)
    return {
      kind: 'action',
      actionCall: {
        name: spec.name as InvokableName,
        args,
      },
    }
  } catch (error) {
    throw new Error(formatActionError(error))
  }
}

const parseStepItem = (item: Parsed): StandardStep => {
  if (item.name === 'respond') {
    const parsed = respondSchema.safeParse(item.attrs)
    if (!parsed.success) throw new Error(formatRespondError(parsed.error))
    return {
      kind: 'respond',
      response: parsed.data.response,
    }
  }
  return parseActionStep(item)
}

export const parseStandardStep = (output: string): StandardStep => {
  const raw = output.trim()
  if (!raw) throw new Error('standard_step_empty')

  const parsed = parseActions(raw)
  const actions =
    parsed.actions.length > 0 ? parsed.actions : parseLooseLines(raw)
  const last = actions[actions.length - 1]
  if (!last) throw new Error('standard_step_parse_failed:missing_valid_action')

  return parseStepItem(last)
}
