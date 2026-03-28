import { useMemo, useRef } from 'react'

import { useAppLocalActions } from './use-app-local-actions.js'
import { useAppRequestActions } from './use-app-request-actions.js'

import type { AppActionParams } from './use-app-actions-types.js'

export const useAppActions = ({
  composerValue,
  confirmDialog,
  deleteMode,
  openPlanMenuId,
  openTaskMenuId,
  quote,
  scroll,
  sendPending,
  setAppState,
  setBusy,
  setComposerValue,
  setConfirmDialog,
  setDeleteMode,
  setFocusesOpen,
  setOpenPlanMenuId,
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
    openPlanMenuId,
    openTaskMenuId,
    quote,
    sendPending,
    toolsMenuOpen,
  })
  stateRef.current = {
    composerValue,
    confirmDialog,
    deleteMode,
    openPlanMenuId,
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
    setOpenPlanMenuId,
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
  })

  return useMemo(
    () => ({ ...localActions, ...requestActions }),
    [localActions, requestActions],
  )
}
