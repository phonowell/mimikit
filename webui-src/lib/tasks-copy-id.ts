import { copyIdToClipboard } from './copy-id-to-clipboard.js'
import { UI_TEXT } from './system-text.js'

const TASK_COPY_TEXT = {
  failedApiUnavailable: UI_TEXT.copyTaskIdFailedApiUnavailable,
  failedInsecureContext: UI_TEXT.copyTaskIdFailedInsecureContext,
  failedPermissionDenied: UI_TEXT.copyTaskIdFailedPermissionDenied,
  failedWrite: UI_TEXT.copyTaskIdFailedWrite,
  manualCopyFallback: UI_TEXT.copyTaskIdManualCopyFallback,
  manualCopyHint: UI_TEXT.copyTaskIdManualCopyHint,
  manualCopyPrompt: UI_TEXT.copyTaskIdManualCopyPrompt,
  missing: UI_TEXT.copyTaskIdMissing,
  success: UI_TEXT.copyTaskIdSuccess,
}

const PLAN_COPY_TEXT = {
  failedApiUnavailable: UI_TEXT.copyTaskIdFailedApiUnavailable,
  failedInsecureContext: UI_TEXT.copyTaskIdFailedInsecureContext,
  failedPermissionDenied: UI_TEXT.copyTaskIdFailedPermissionDenied,
  failedWrite: UI_TEXT.copyPlanIdFailedWrite,
  manualCopyFallback: UI_TEXT.copyPlanIdManualCopyFallback,
  manualCopyHint: UI_TEXT.copyTaskIdManualCopyHint,
  manualCopyPrompt: UI_TEXT.copyPlanIdManualCopyPrompt,
  missing: UI_TEXT.copyPlanIdMissing,
  success: UI_TEXT.copyPlanIdSuccess,
}

export const copyTaskIdToClipboard = (taskId: unknown, options = {}) =>
  copyIdToClipboard(taskId, TASK_COPY_TEXT, options)

export const copyPlanIdToClipboard = (planId: unknown, options = {}) =>
  copyIdToClipboard(planId, PLAN_COPY_TEXT, options)
