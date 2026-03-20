import { applyAskUserChoiceAction } from './action-apply-choice.js'
import { applyRunTask } from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyUpsertFocusAction,
} from './action-apply-focus.js'
import { applyRememberMemoryAction } from './action-apply-memory.js'
import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import {
  assignFocusSchema,
  deletePlanSchema,
  mutateTaskSchema,
  updatePlanSchema,
  upsertFocusSchema,
} from './action-apply-schema.js'
import { parseActionAttrs } from './action-parse.js'
import {
  createContinueAction,
  createNoopAction,
  createStopAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  validateAskUserChoice,
  validateCreatePlan,
  validateMutateTask,
  validatePlanById,
  validateQueryContext,
  validateReadFile,
  validateRememberMemory,
  validateRunTask,
  validateSummarizeTaskResult,
  validateUpdatePlan,
  validateWithSchema,
} from './action-validation.js'
import { cancelTask, pauseTask, resumeTask } from './runtime-adapter.js'

import type { Parsed } from '../actions/model/spec.js'

const applyMutateTaskAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, mutateTaskSchema)
  if (!parsed) return
  const { id, op, reason } = parsed
  const meta = {
    source: 'deferred',
    ...(reason ? { reason } : {}),
  }
  if (op === 'pause') {
    await pauseTask(runtime, id, meta)
    return
  }
  if (op === 'resume') {
    await resumeTask(runtime, id, meta)
    return
  }
  await cancelTask(runtime, id, meta)
}

const PLAN_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'create_plan',
      domain: 'plan',
      prompt: {
        summary: '创建持续触发计划。',
        constraints: [
          '必填 `prompt,title,schedule_type`',
          '`scheduled_at` 必须是未来绝对时间',
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
        constraints: [
          '必填 `id` 且至少更新一项',
          '`done` plan 仅允许补 `last_task_id`',
        ],
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
        constraints: ['必填 `id`'],
      },
    },
    (item, context) =>
      validatePlanById('delete_plan', item, deletePlanSchema, context),
    applyDeletePlan,
  ),
] satisfies ManagerActionDefinition[]

const TASK_ACTION_DEFINITIONS = [
  {
    name: 'enqueue_task',
    domain: 'task',
    prompt: {
      summary: '派发一个 worker 任务。',
      constraints: [
        '必填 `title,cwd,goal,in_scope,done_when_1`；`worker_prompt` 可省略并由系统按 contract 自动生成；可选 `branch` 显式指定目标分支，提供后 enqueue 阶段会自动创建或复用对应 worktree，并把任务 `cwd` 切到该 worktree',
        '默认一个目标只创建一个任务',
      ],
    },
    validate: (item, context) => validateRunTask(item, context),
    apply: (runtime, item, context) =>
      applyRunTask(runtime, item, context.seen, context.options),
  } satisfies ManagerActionDefinition,
  createContinueAction(
    {
      name: 'mutate_task',
      domain: 'task',
      prompt: {
        summary: '暂停、恢复或取消任务。',
        constraints: ['必填 `id,op`', '仅用于显式任务控制'],
      },
    },
    (item, context) => validateMutateTask(item, context),
    applyMutateTaskAction,
  ),
  createNoopAction(
    {
      name: 'set_task_result_summary',
      domain: 'task',
      prompt: {
        summary: '为当前批次 `task_result` 写摘要。',
        constraints: ['必填 `task_id,summary`', '仅能引用当前批次可见结果'],
      },
    },
    (item, context) => validateSummarizeTaskResult(item, context),
  ),
] satisfies ManagerActionDefinition[]

const DIALOG_ACTION_DEFINITIONS = [
  createStopAction(
    {
      name: 'ask_user_choice',
      domain: 'dialog',
      prompt: {
        summary: '生成一个待用户返回后处理的有限选择。',
        constraints: [
          '仅在有限候选且确需用户决策时使用',
          '`telegram`/`feishu` 来源不可用',
        ],
      },
    },
    (item, context) => validateAskUserChoice(item, context),
    (runtime, item) => applyAskUserChoiceAction(runtime, item),
  ),
] satisfies ManagerActionDefinition[]

const LOOKUP_ACTION_DEFINITIONS = [
  createNoopAction(
    {
      name: 'query_context',
      domain: 'lookup',
      prompt: {
        summary: '检索历史、任务、计划等补充上下文。',
        constraints: ['必填 `query`', '单轮最多一次'],
      },
    },
    validateQueryContext,
  ),
  createNoopAction(
    {
      name: 'read_file',
      domain: 'lookup',
      prompt: {
        summary: '读取明确路径的文件片段。',
        constraints: ['必填 `path`', '仅在路径明确时使用，单轮最多一次'],
      },
    },
    validateReadFile,
  ),
] satisfies ManagerActionDefinition[]

const FOCUS_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'upsert_focus',
      domain: 'focus',
      prompt: {
        summary: '创建或更新 focus 状态。',
        constraints: ['必填 `id`', '`open_item_n` 必须连续编号'],
      },
    },
    (item) => validateWithSchema(item, upsertFocusSchema),
    applyUpsertFocusAction,
  ),
  createContinueAction(
    {
      name: 'assign_focus',
      domain: 'focus',
      prompt: {
        summary: '给 task、plan 或 history 绑定 focus。',
        constraints: ['必填 `target_type,target_id,focus_id`'],
      },
    },
    (item) => validateWithSchema(item, assignFocusSchema),
    applyAssignFocusAction,
  ),
] satisfies ManagerActionDefinition[]

const MEMORY_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'remember_memory',
      domain: 'memory',
      prompt: {
        summary: '写入长期记忆。',
        constraints: ['仅支持 `content`', '只保存稳定偏好或长期约束'],
      },
    },
    (item) => validateRememberMemory(item),
    applyRememberMemoryAction,
  ),
] satisfies ManagerActionDefinition[]

export const ACTION_DEFINITIONS = [
  ...LOOKUP_ACTION_DEFINITIONS,
  ...TASK_ACTION_DEFINITIONS,
  ...PLAN_ACTION_DEFINITIONS,
  ...DIALOG_ACTION_DEFINITIONS,
  ...FOCUS_ACTION_DEFINITIONS,
  ...MEMORY_ACTION_DEFINITIONS,
] satisfies ManagerActionDefinition[]
