import { parseActions, parseLooseLines } from '../actions/protocol/parse.js'
import { getInvokableSpec } from '../actions/registry/index.js'
import { parseArgs } from '../actions/shared/args.js'

import type { Parsed } from '../actions/model/spec.js'
import type { InvokableName } from '../actions/registry/index.js'

export type StandardStep =
  | {
      kind: 'final'
      output: string
    }
  | {
      kind: 'action'
      actionCall: {
        name: InvokableName
        args: Record<string, unknown>
      }
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

export const parseStandardStep = (output: string): StandardStep => {
  const raw = output.trim()
  if (!raw) throw new Error('standard_step_empty')

  const parsed = parseActions(raw)
  const sourceActions =
    parsed.actions.length > 0 ? parsed.actions : parseLooseLines(raw)
  const last = sourceActions[sourceActions.length - 1]
  if (last) return parseActionStep(last)

  const finalOutput = parsed.text.trim()
  if (!finalOutput) throw new Error('standard_step_parse_failed:missing_output')
  return {
    kind: 'final',
    output: finalOutput,
  }
}
