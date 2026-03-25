import { useMemo, useRef } from 'react'

import { useAppLocalActions } from './use-app-local-actions.js'
import { useAppRequestActions } from './use-app-request-actions.js'

import type { AppActionParams } from './use-app-actions-types.js'

export const useAppActions = ({
  composerValue,
  confirmDialog,
  deleteMode,
  openTaskMenuId,
  quote,
  scroll,
  sendPending,
  setAppState,
  setBusy,
  setChoiceSubmission,
  setComposerValue,
  setConfirmDialog,
  setDeleteMode,
  setFocusesOpen,
  setOpenTaskMenuId,
  setPlansOpen,
  setQuote,
  setSendPending,
  setStatusOverride,
  setTasksOpen,
  setToast,
  setToolsMenuOpen,
  setTtsEnabled,
  toolsMenuOpen,
}: AppActionParams) => {
  const stateRef = useRef({
    composerValue,
    confirmDialog,
    deleteMode,
    openTaskMenuId,
    quote,
    sendPending,
    toolsMenuOpen,
  })
  stateRef.current = {
    composerValue,
    confirmDialog,
    deleteMode,
    openTaskMenuId,
    quote,
    sendPending,
    toolsMenuOpen,
  }
  const localActions = useAppLocalActions({
    scroll,
    setComposerValue,
    setConfirmDialog,
    setDeleteMode,
    setFocusesOpen,
    setOpenTaskMenuId,
    setPlansOpen,
    setQuote,
    setTasksOpen,
    setToolsMenuOpen,
    setTtsEnabled,
    stateRef,
  })
  const requestActions = useAppRequestActions({
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
  })

  return useMemo(
    () => ({ ...localActions, ...requestActions }),
    [localActions, requestActions],
  )
}
