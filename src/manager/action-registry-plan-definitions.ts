import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import { deletePlanSchema, updatePlanSchema } from './action-apply-schema.js'
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
      prompt: {
        summary: '创建持续触发计划。',
        briefConstraints: ['必填 `title,schedule_type,effect_kind`'],
        detailConstraints: [
          '`schedule_type="scheduled_at"` 时，`scheduled_at` 必须是未来绝对时间',
          '`effect_kind="enqueue_task"` 时必须提供 task 模板与 contract',
        ],
      },
    },
    (item, context) => validateCreatePlan(item, context),
    applyCreatePlan,
  ),
  createContinueAction(
    {
      name: 'update_plan',
      domain: 'plan',
      prompt: {
        summary: '更新现有计划。',
        briefConstraints: ['必填 `id` 且至少更新一项'],
      },
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
      prompt: {
        summary: '删除现有计划。',
        briefConstraints: ['必填 `id`'],
      },
    },
    (item, context) =>
      validatePlanById('delete_plan', item, deletePlanSchema, context),
    applyDeletePlan,
  ),
] satisfies ManagerActionDefinition[]

export { PLAN_ACTION_DEFINITIONS }
