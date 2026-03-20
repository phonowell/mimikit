import type { ApplyTaskActionsOptions } from './action-apply-create.js'
import type { FeedbackContext, ValidationIssue } from './action-validation.js'
import type { RuntimeState } from './runtime-adapter.js'
import type { Parsed } from '../actions/model/spec.js'

export type ManagerActionDomain =
  | 'lookup'
  | 'task'
  | 'plan'
  | 'dialog'
  | 'focus'
  | 'memory'

export type ManagerActionPromptSpec = {
  summary: string
  briefConstraints?: readonly string[]
  detailConstraints?: readonly string[]
}

export type ApplyContext = {
  seen: Set<string>
  options?: ApplyTaskActionsOptions
}

export type ApplyResult = 'continue' | 'stop'

export type ManagerActionDefinition = {
  name: string
  domain: ManagerActionDomain
  prompt: ManagerActionPromptSpec
  validate: (item: Parsed, context: FeedbackContext) => ValidationIssue[]
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<ApplyResult>
}

export const continueApply = (): Promise<ApplyResult> =>
  Promise.resolve('continue')

export const createContinueAction = (
  definition: Pick<ManagerActionDefinition, 'name' | 'domain' | 'prompt'>,
  validate: ManagerActionDefinition['validate'],
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<void>,
): ManagerActionDefinition => ({
  ...definition,
  validate,
  apply: async (runtime, item, context) => (
    await apply(runtime, item, context),
    'continue'
  ),
})

export const createStopAction = (
  definition: Pick<ManagerActionDefinition, 'name' | 'domain' | 'prompt'>,
  validate: ManagerActionDefinition['validate'],
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<void>,
): ManagerActionDefinition => ({
  ...definition,
  validate,
  apply: async (runtime, item, context) => (
    await apply(runtime, item, context),
    'stop'
  ),
})

export const createNoopAction = (
  definition: Pick<ManagerActionDefinition, 'name' | 'domain' | 'prompt'>,
  validate: ManagerActionDefinition['validate'],
): ManagerActionDefinition => ({
  ...definition,
  validate,
  apply: continueApply,
})
