import { useCallback, useMemo } from 'react'

import { appendClientError } from '../lib/client-error.js'
import { runConfirmAction } from '../lib/confirm-action.js'
import { readJsonError } from '../lib/controller-utils.js'
import { fetchWithTimeout } from '../lib/fetch-with-timeout.js'
import { submitMessage } from '../lib/submit-message.js'
import { UI_TEXT } from '../lib/system-text.js'
import { copyTaskIdToClipboard } from '../lib/tasks-copy-id.js'

import type {
  AppActionParams,
  AppActionStateRef,
} from './use-app-actions-types.js'

type Params = Pick<
  AppActionParams,
  | 'scroll'
  | 'setAppState'
  | 'setBusy'
  | 'setChoiceSubmission'
  | 'setComposerValue'
  | 'setConfirmDialog'
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
  setChoiceSubmission,
  setComposerValue,
  setConfirmDialog,
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

  const selectChoice = useCallback(
    async (choiceId: string, optionId: string) => {
      setChoiceSubmission({ choiceId, optionId, status: 'submitting' })
      try {
        const response = await fetchWithTimeout(
          `/api/choices/${encodeURIComponent(choiceId)}/select`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optionId }),
          },
          15_000,
        )
        if (!response.ok) {
          throw new Error(
            await readJsonError(response, UI_TEXT.choiceSelectFailed),
          )
        }

        setChoiceSubmission({ choiceId, optionId, status: 'submitted' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setChoiceSubmission({ choiceId, optionId, status: 'error', message })
      }
    },
    [setChoiceSubmission],
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

  return useMemo(
    () => ({
      confirmAction,
      selectChoice,
      submitMessage: submitCurrentMessage,
      triggerTaskAction,
    }),
    [confirmAction, selectChoice, submitCurrentMessage, triggerTaskAction],
  )
}
