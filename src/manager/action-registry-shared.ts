import type { ApplyTaskActionsOptions } from './action-apply-create.js'
import type { FeedbackContext, ValidationIssue } from './action-validation.js'
import type { RuntimeState } from './runtime-adapter.js'
import type { Parsed } from '../actions/model/spec.js'

export type ApplyContext = {
  seen: Set<string>
  options?: ApplyTaskActionsOptions
}

export type ApplyResult = 'continue' | 'stop'

export type ManagerActionDefinition = {
  name: string
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
  name: string,
  validate: ManagerActionDefinition['validate'],
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<void>,
): ManagerActionDefinition => ({
  name,
  validate,
  apply: async (runtime, item, context) => (
    await apply(runtime, item, context),
    'continue'
  ),
})

export const createStopAction = (
  name: string,
  validate: ManagerActionDefinition['validate'],
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<void>,
): ManagerActionDefinition => ({
  name,
  validate,
  apply: async (runtime, item, context) => (
    await apply(runtime, item, context),
    'stop'
  ),
})

export const createNoopAction = (
  name: string,
  validate: ManagerActionDefinition['validate'],
): ManagerActionDefinition => ({
  name,
  validate,
  apply: continueApply,
})
