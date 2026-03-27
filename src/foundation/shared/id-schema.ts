import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const FOCUS_ID_PATTERN = /^focus-[a-zA-Z0-9._-]+$/
export const TASK_ID_PATTERN = /^task-[a-zA-Z0-9._-]+$/
export const PLAN_ID_PATTERN = /^plan-[a-zA-Z0-9._-]+$/

export const focusIdSchema = nonEmptyString.regex(FOCUS_ID_PATTERN)
export const taskIdSchema = nonEmptyString.regex(TASK_ID_PATTERN)
export const planIdSchema = nonEmptyString.regex(PLAN_ID_PATTERN)
