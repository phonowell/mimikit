import {
  isExactAnchorSupportedByInputs,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'

import type { Task, TaskPlan } from '../../foundation/types/index.js'

export const buildEnqueueContinuationCandidateRef = (value: {
  id: string
  title: string
}): string =>
  value.title.trim() ? `${value.id} / ${value.title.trim()}` : value.id

export const inputDirectlyReferencesPlan = (
  inputTexts: string[],
  plan: TaskPlan | undefined,
): boolean => {
  if (!plan) return false
  return (
    isExactAnchorSupportedByInputs({
      candidates: [plan.id],
      inputs: inputTexts,
    }) ||
    isSupportedByInputs({
      candidates: [plan.title],
      inputs: inputTexts,
    })
  )
}

export const inputDirectlyReferencesTask = (
  inputTexts: string[],
  task: Task | undefined,
): boolean => {
  if (!task) return false
  return (
    isExactAnchorSupportedByInputs({
      candidates: [task.id],
      inputs: inputTexts,
    }) ||
    isSupportedByInputs({
      candidates: [task.title],
      inputs: inputTexts,
    })
  )
}

export const inputDirectlyReferencesPlanId = (
  inputTexts: string[],
  plan: TaskPlan | undefined,
): boolean => {
  if (!plan) return false
  return isExactAnchorSupportedByInputs({
    candidates: [plan.id],
    inputs: inputTexts,
  })
}

export const inputDirectlyReferencesTaskId = (
  inputTexts: string[],
  task: Task | undefined,
): boolean => {
  if (!task) return false
  return isExactAnchorSupportedByInputs({
    candidates: [task.id],
    inputs: inputTexts,
  })
}
