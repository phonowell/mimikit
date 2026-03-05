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

export const applyAndContinue =
  (
    apply: (runtime: RuntimeState, item: Parsed) => Promise<void>,
  ): ManagerActionDefinition['apply'] =>
  async (runtime, item) => (await apply(runtime, item), 'continue')

export const createNoopAction = (
  name: string,
  validate: (item: Parsed) => ValidationIssue[],
): ManagerActionDefinition => ({
  name,
  validate: (item) => validate(item),
  apply: continueApply,
})
