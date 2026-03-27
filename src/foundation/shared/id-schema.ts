import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const FOCUS_ID_PATTERN = /^focus-[a-zA-Z0-9._-]+$/
export const CHOICE_ID_PATTERN = /^choice-[a-zA-Z0-9._-]+$/
export const OPTION_ID_PATTERN = /^option-[a-zA-Z0-9._-]+$/
export const TASK_ID_PATTERN = /^task-[a-zA-Z0-9._-]+$/
export const PLAN_ID_PATTERN = /^plan-[a-zA-Z0-9._-]+$/

export const focusIdSchema = nonEmptyString.regex(FOCUS_ID_PATTERN)
export const choiceIdSchema = nonEmptyString.regex(CHOICE_ID_PATTERN)
export const optionIdSchema = nonEmptyString.regex(OPTION_ID_PATTERN)
export const taskIdSchema = nonEmptyString.regex(TASK_ID_PATTERN)
export const planIdSchema = nonEmptyString.regex(PLAN_ID_PATTERN)
