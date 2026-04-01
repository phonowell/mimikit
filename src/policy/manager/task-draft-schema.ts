import { z } from 'zod'

const s = z.string().trim().min(1)
const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

const MAX_TASK_TITLE_CHARS = 120
const MAX_TASK_TITLE_BYTES = 360
const MAX_TASK_GOAL_CHARS = 240
const MAX_TASK_GOAL_BYTES = 720
const MAX_TASK_LIST_ITEM_CHARS = 160
const MAX_TASK_LIST_ITEM_BYTES = 480
const MAX_TASK_CONTEXT_REF_CHARS = 200
const MAX_TASK_CONTEXT_REF_BYTES = 600
const MAX_TASK_INSTRUCTION_CHARS = 120
const MAX_TASK_INSTRUCTION_BYTES = 360
const MAX_TASK_DRAFT_TOTAL_CHARS = 900
const MAX_TASK_DRAFT_TOTAL_BYTES = 2_700

const compactString = (params: {
  maxChars: number
  maxBytes: number
  message: string
}) =>
  z
    .string()
    .trim()
    .min(1)
    .max(params.maxChars, { message: params.message })
    .superRefine((value, ctx) => {
      if (byteLength(value) <= params.maxBytes) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${params.message}（UTF-8 <=${params.maxBytes} bytes）`,
      })
    })

const compactList = (params: {
  max: number
  min?: number
  itemSchema?: z.ZodString
}) =>
  z
    .array(params.itemSchema ?? s)
    .min(params.min ?? 0)
    .max(params.max)

const titleSchema = compactString({
  maxChars: MAX_TASK_TITLE_CHARS,
  maxBytes: MAX_TASK_TITLE_BYTES,
  message: `请收敛为 <=${MAX_TASK_TITLE_CHARS} chars 的简短任务标题`,
})

const goalSchema = compactString({
  maxChars: MAX_TASK_GOAL_CHARS,
  maxBytes: MAX_TASK_GOAL_BYTES,
  message: `请收敛为 <=${MAX_TASK_GOAL_CHARS} chars 的单段目标说明`,
})

const taskListItemSchema = compactString({
  maxChars: MAX_TASK_LIST_ITEM_CHARS,
  maxBytes: MAX_TASK_LIST_ITEM_BYTES,
  message: `请收敛为 <=${MAX_TASK_LIST_ITEM_CHARS} chars 的高密度短句`,
})

const contextRefSchema = compactString({
  maxChars: MAX_TASK_CONTEXT_REF_CHARS,
  maxBytes: MAX_TASK_CONTEXT_REF_BYTES,
  message: `请保留 <=${MAX_TASK_CONTEXT_REF_CHARS} chars 的最必要上下文引用`,
})

const instructionSchema = compactString({
  maxChars: MAX_TASK_INSTRUCTION_CHARS,
  maxBytes: MAX_TASK_INSTRUCTION_BYTES,
  message: `请收敛为 <=${MAX_TASK_INSTRUCTION_CHARS} chars 的恢复补充`,
})

export const managerTaskDraftInstructionsSchema = compactList({
  max: 3,
  itemSchema: instructionSchema,
})

const taskDraftObjectSchema = z.strictObject({
  title: titleSchema,
  cwd: s,
  mode: z.enum(['read', 'write']),
  use_worktree: z.boolean().default(false),
  goal: goalSchema,
  in_scope: compactList({
    max: 5,
    min: 1,
    itemSchema: taskListItemSchema,
  }),
  out_of_scope: compactList({
    max: 5,
    itemSchema: taskListItemSchema,
  }),
  done_when: compactList({
    max: 5,
    min: 1,
    itemSchema: taskListItemSchema,
  }),
  context_refs: compactList({
    max: 5,
    itemSchema: contextRefSchema,
  }),
  instructions: managerTaskDraftInstructionsSchema,
})

export const managerTaskDraftParseSchema = taskDraftObjectSchema.refine(
  (draft) => draft.mode === 'write' || draft.use_worktree !== true,
  {
    message: '`task.use_worktree` 仅允许用于 `mode="write"` 的任务。',
    path: ['use_worktree'],
  },
)

export const managerTaskDraftSchema = managerTaskDraftParseSchema.superRefine(
  (draft, ctx) => {
    const parts = [
      draft.title,
      draft.goal,
      ...draft.in_scope,
      ...draft.out_of_scope,
      ...draft.done_when,
      ...draft.context_refs,
      ...draft.instructions,
    ]
    const totalChars = parts.reduce((sum, item) => sum + item.length, 0)
    const totalBytes = parts.reduce((sum, item) => sum + byteLength(item), 0)
    if (
      totalChars <= MAX_TASK_DRAFT_TOTAL_CHARS &&
      totalBytes <= MAX_TASK_DRAFT_TOTAL_BYTES
    )
      return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        '任务合同整体过长；请优先保留 goal、1-3 条 in_scope/done_when 与最必要 context_refs，避免重复解释' +
        `（<=${MAX_TASK_DRAFT_TOTAL_CHARS} chars，UTF-8 <=${MAX_TASK_DRAFT_TOTAL_BYTES} bytes）`,
    })
  },
)
