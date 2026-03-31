import { appendClientError } from '../lib/client-error.js'
import { runConfirmAction } from '../lib/confirm-action.js'
import { readJsonError } from '../lib/controller-utils.js'
import { submitMessage } from '../lib/submit-message.js'
import {
  copyPlanIdToClipboard,
  copyTaskIdToClipboard,
} from '../lib/tasks-copy-id.js'

import type {
  AppActionParams,
  AppActionStateRef,
} from './use-app-actions-types.js'

type Params = Pick<
  AppActionParams,
  | 'scroll'
  | 'setAppState'
  | 'setBusy'
  | 'setComposerValue'
  | 'setConfirmDialog'
  | 'setOpenPlanMenuId'
  | 'setOpenTaskMenuId'
  | 'setQuote'
  | 'setSendPending'
  | 'setStatusOverride'
  | 'setToolsMenuOpen'
> & {
  stateRef: AppActionStateRef
}

export const useAppRequestActions = ({
  scroll,
  setAppState,
  setBusy,
  setComposerValue,
  setConfirmDialog,
  setOpenPlanMenuId,
  setOpenTaskMenuId,
  setQuote,
  setSendPending,
  setStatusOverride,
  setToolsMenuOpen,
  stateRef,
}: Params) => {
  const appendError = (error: unknown) => appendClientError(setAppState, error)

  const confirmAction = () =>
    runConfirmAction({
      appendClientError: appendError,
      confirmDialog: stateRef.current.confirmDialog,
      quote: stateRef.current.quote,
      setAppState,
      setBusy,
      setConfirmDialog,
      setQuote,
      setStatusOverride,
      setToolsMenuOpen,
    })

  const submitCurrentMessage = () =>
    submitMessage({
      appendClientError: appendError,
      composerValue: stateRef.current.composerValue,
      quote: stateRef.current.quote,
      scroll,
      sendPending: stateRef.current.sendPending,
      setAppState,
      setComposerValue,
      setQuote,
      setSendPending,
    })

  const triggerTaskAction = async (
    taskId: string,
    action: 'cancel' | 'pause' | 'resume' | 'copy-id',
  ) => {
    setToolsMenuOpen(false)
    setOpenTaskMenuId('')
    try {
      if (action === 'copy-id') {
        await copyTaskIdToClipboard(taskId)
        return
      }

      const response = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/${action}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        throw new Error(
          await readJsonError(response, `Failed to ${action} task`),
        )
      }
    } catch (error) {
      appendError(error)
    }
  }

  const triggerPlanAction = async (planId: string, action: 'copy-id') => {
    setToolsMenuOpen(false)
    setOpenPlanMenuId('')
    try {
      if (action !== 'copy-id') return
      await copyPlanIdToClipboard(planId)
    } catch (error) {
      appendError(error)
    }
  }

  return {
    confirmAction,
    submitMessage: submitCurrentMessage,
    triggerPlanAction,
    triggerTaskAction,
  }
}
