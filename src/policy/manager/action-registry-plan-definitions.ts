import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import { deletePlanSchema, updatePlanSchema } from './action-apply-schema.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import {
  createContinueAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  validateCreatePlan,
  validatePlanById,
  validateUpdatePlan,
} from './action-validation.js'

const PLAN_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'create_plan',
      domain: 'plan',
      prompt: ACTION_PROMPT_SPECS.create_plan,
    },
    (item, context) => validateCreatePlan(item, context),
    applyCreatePlan,
  ),
  createContinueAction(
    {
      name: 'update_plan',
      domain: 'plan',
      prompt: ACTION_PROMPT_SPECS.update_plan,
    },
    (item, context) => {
      const byIdIssues = validatePlanById(
        'update_plan',
        item,
        updatePlanSchema,
        context,
      )
      if (byIdIssues.length > 0) return byIdIssues
      return validateUpdatePlan(item, context)
    },
    applyUpdatePlan,
  ),
  createContinueAction(
    {
      name: 'delete_plan',
      domain: 'plan',
      prompt: ACTION_PROMPT_SPECS.delete_plan,
    },
    (item, context) =>
      validatePlanById('delete_plan', item, deletePlanSchema, context),
    applyDeletePlan,
  ),
] satisfies ManagerActionDefinition[]

export { PLAN_ACTION_DEFINITIONS }
