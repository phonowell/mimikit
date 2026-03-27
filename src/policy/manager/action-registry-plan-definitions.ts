import { applyDeletePlan, applySetPlan } from './action-apply-plan.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import {
  createContinueAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import { validateDeletePlan, validateSetPlan } from './action-validation.js'

export const PLAN_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'set_plan',
      domain: 'plan',
      prompt: ACTION_PROMPT_SPECS.set_plan,
    },
    (item, context) => validateSetPlan(item, context),
    applySetPlan,
  ),
  createContinueAction(
    {
      name: 'delete_plan',
      domain: 'plan',
      prompt: ACTION_PROMPT_SPECS.delete_plan,
    },
    (item, context) => validateDeletePlan(item, context),
    applyDeletePlan,
  ),
] satisfies ManagerActionDefinition[]
