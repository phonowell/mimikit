import { useCallback, useMemo } from 'react'

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
  | 'setToast'
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
  setToast,
  setToolsMenuOpen,
  stateRef,
}: Params) => {
  const appendError = useCallback(
    (error: unknown) => appendClientError(setAppState, error),
    [setAppState],
  )

  const confirmAction = useCallback(
    () =>
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
      }),
    [
      appendError,
      setAppState,
      setBusy,
      setConfirmDialog,
      setQuote,
      setStatusOverride,
      setToolsMenuOpen,
      stateRef,
    ],
  )

  const submitCurrentMessage = useCallback(
    () =>
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
      }),
    [
      appendError,
      scroll.captureLayoutShift,
      setAppState,
      setComposerValue,
      setQuote,
      setSendPending,
      stateRef,
    ],
  )

  const triggerTaskAction = useCallback(
    async (
      taskId: string,
      action: 'cancel' | 'pause' | 'resume' | 'copy-id',
    ) => {
      setToolsMenuOpen(false)
      setOpenTaskMenuId('')
      try {
        if (action === 'copy-id') {
          const result = await copyTaskIdToClipboard(taskId)
          setToast({
            message: result.message,
            state: result.ok ? 'success' : 'error',
          })
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
    },
    [appendError, setOpenTaskMenuId, setToast, setToolsMenuOpen],
  )

  const triggerPlanAction = useCallback(
    async (planId: string, action: 'copy-id') => {
      setToolsMenuOpen(false)
      setOpenPlanMenuId('')
      try {
        if (action !== 'copy-id') return
        const result = await copyPlanIdToClipboard(planId)
        setToast({
          message: result.message,
          state: result.ok ? 'success' : 'error',
        })
      } catch (error) {
        appendError(error)
      }
    },
    [appendError, setOpenPlanMenuId, setToast, setToolsMenuOpen],
  )

  return useMemo(
    () => ({
      confirmAction,
      submitMessage: submitCurrentMessage,
      triggerPlanAction,
      triggerTaskAction,
    }),
    [confirmAction, submitCurrentMessage, triggerPlanAction, triggerTaskAction],
  )
}
