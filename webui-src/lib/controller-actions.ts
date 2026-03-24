import { runConfirmAction } from './confirm-action.js'
import {
  focusElementById,
  readJsonError,
  resolveDeleteModeTransition,
  toQuoteState,
} from './controller-utils.js'
import { fetchWithTimeout } from './fetch-with-timeout.js'
import { UI_TEXT } from './system-text.js'
import { copyTaskIdToClipboard } from './tasks-copy-id.js'

import type {
  AppState,
  ChatMessage,
  ConfirmDialogState,
  QuoteState,
  ToastState,
} from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

type ScrollController = { captureLayoutShift: () => void }

type ChoicePendingState = { choiceId: string; optionId: string }

type ControllerActionsArgs = {
  appendClientError: (error: unknown) => void
  confirmDialog: ConfirmDialogState | null
  deleteMode: boolean
  openTaskMenuId: string
  quote: QuoteState | null
  scroll: ScrollController
  setAppState: Dispatch<SetStateAction<AppState>>
  setBusy: Dispatch<SetStateAction<boolean>>
  setChoiceMetaOverrides: Dispatch<SetStateAction<Map<string, string>>>
  setChoicePending: Dispatch<SetStateAction<ChoicePendingState>>
  setComposerValue: (value: string) => void
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>
  setDeleteMode: Dispatch<SetStateAction<boolean>>
  setFocusesOpen: Dispatch<SetStateAction<boolean>>
  setOpenTaskMenuId: Dispatch<SetStateAction<string>>
  setPlansOpen: Dispatch<SetStateAction<boolean>>
  setQuote: Dispatch<SetStateAction<QuoteState | null>>
  setStatusOverride: Dispatch<
    SetStateAction<{ state: string; text: string } | null>
  >
  setTasksOpen: Dispatch<SetStateAction<boolean>>
  setToast: Dispatch<SetStateAction<ToastState | null>>
  setToolsMenuOpen: Dispatch<SetStateAction<boolean>>
  setTtsEnabled: (enabled: boolean) => void
  submitMessage: () => Promise<void>
  toolsMenuOpen: boolean
}

export const createControllerActions = ({
  appendClientError,
  confirmDialog,
  deleteMode,
  openTaskMenuId,
  quote,
  scroll,
  setAppState,
  setBusy,
  setChoiceMetaOverrides,
  setChoicePending,
  setComposerValue,
  setConfirmDialog,
  setDeleteMode,
  setFocusesOpen,
  setOpenTaskMenuId,
  setPlansOpen,
  setQuote,
  setStatusOverride,
  setTasksOpen,
  setToast,
  setToolsMenuOpen,
  setTtsEnabled,
  submitMessage,
  toolsMenuOpen,
}: ControllerActionsArgs) => {
  const applyDeleteMode = (nextDeleteMode: boolean) => {
    const transition = resolveDeleteModeTransition(
      {
        deleteMode,
        openTaskMenuId,
        quote,
        toolsMenuOpen,
      },
      nextDeleteMode,
    )
    if (transition.deleteMode === deleteMode) return
    scroll.captureLayoutShift()
    setDeleteMode(transition.deleteMode)
    setToolsMenuOpen(transition.toolsMenuOpen)
    setOpenTaskMenuId(transition.openTaskMenuId)
    setQuote(transition.quote)
    focusElementById(transition.focusTargetId)
  }

  return {
    clearQuote: () => {
      scroll.captureLayoutShift()
      setQuote(null)
    },
    closeConfirmDialog: () => setConfirmDialog(null),
    closeFocuses: () => setFocusesOpen(false),
    closePlans: () => setPlansOpen(false),
    closeTasks: () => setTasksOpen(false),
    confirmAction: () =>
      runConfirmAction({
        appendClientError,
        confirmDialog,
        quote,
        setAppState,
        setBusy,
        setConfirmDialog,
        setQuote,
        setStatusOverride,
        setToolsMenuOpen,
      }),
    exitDeleteMode: () => applyDeleteMode(false),
    onComposerInput: (value: string) => setComposerValue(value),
    openFocuses: () => setFocusesOpen(true),
    openPlans: () => setPlansOpen(true),
    openRestartDialog: () => setConfirmDialog({ kind: 'restart' }),
    openResetDialog: () => setConfirmDialog({ kind: 'reset' }),
    openTasks: () => setTasksOpen(true),
    requestDeleteMessage: (message: ChatMessage) =>
      setConfirmDialog({ kind: 'message', id: message.id ?? '' }),
    requestDeleteTask: (id: string, title: string) =>
      setConfirmDialog({ kind: 'task', id, title }),
    selectChoice: async (choiceId: string, optionId: string) => {
      setChoicePending({ choiceId, optionId })
      setChoiceMetaOverrides(new Map([[choiceId, UI_TEXT.choiceSubmitting]]))
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
        setChoiceMetaOverrides(new Map([[choiceId, UI_TEXT.choiceSubmitted]]))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setChoicePending({ choiceId: '', optionId: '' })
        setChoiceMetaOverrides(
          new Map([[choiceId, `${UI_TEXT.choiceSelectFailed}: ${message}`]]),
        )
      }
    },
    selectQuote: (message: ChatMessage) => {
      scroll.captureLayoutShift()
      setQuote(toQuoteState(message))
    },
    setTtsEnabled,
    submitMessage,
    toggleDeleteMode: () => applyDeleteMode(!deleteMode),
    toggleTaskMenu: (taskId: string) =>
      setOpenTaskMenuId((current) => (current === taskId ? '' : taskId)),
    toggleToolsMenu: () => setToolsMenuOpen((current) => !current),
    triggerTaskAction: async (
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
        appendClientError(error)
      }
    },
  }
}
