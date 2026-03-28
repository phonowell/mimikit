import { useCallback, useMemo } from 'react'

import {
  focusElementById,
  resolveDeleteModeTransition,
  toQuoteState,
} from '../lib/controller-utils.js'

import type { ChatMessage } from '../types.js'
import type {
  AppActionParams,
  AppActionStateRef,
} from './use-app-actions-types.js'

type Params = Pick<
  AppActionParams,
  | 'scroll'
  | 'setComposerValue'
  | 'setConfirmDialog'
  | 'setDeleteMode'
  | 'setOpenPlanMenuId'
  | 'setOpenTaskMenuId'
  | 'setPlansOpen'
  | 'setQuote'
  | 'setTasksOpen'
  | 'setToolsMenuOpen'
> & {
  stateRef: AppActionStateRef
}

export const useAppLocalActions = ({
  scroll,
  setComposerValue,
  setConfirmDialog,
  setDeleteMode,
  setOpenPlanMenuId,
  setOpenTaskMenuId,
  setPlansOpen,
  setQuote,
  setTasksOpen,
  setToolsMenuOpen,
  stateRef,
}: Params) => {
  const applyDeleteMode = useCallback(
    (nextDeleteMode: boolean) => {
      const current = stateRef.current
      const transition = resolveDeleteModeTransition(
        {
          deleteMode: current.deleteMode,
          openPlanMenuId: current.openPlanMenuId,
          openTaskMenuId: current.openTaskMenuId,
          quote: current.quote,
          toolsMenuOpen: current.toolsMenuOpen,
        },
        nextDeleteMode,
      )
      if (transition.deleteMode === current.deleteMode) return
      scroll.captureLayoutShift()
      setDeleteMode(transition.deleteMode)
      setToolsMenuOpen(transition.toolsMenuOpen)
      setOpenPlanMenuId(transition.openPlanMenuId)
      setOpenTaskMenuId(transition.openTaskMenuId)
      setQuote(transition.quote)
      focusElementById(transition.focusTargetId)
    },
    [
      scroll.captureLayoutShift,
      setDeleteMode,
      setOpenPlanMenuId,
      setOpenTaskMenuId,
      setQuote,
      setToolsMenuOpen,
      stateRef,
    ],
  )

  const clearQuote = useCallback(() => {
    scroll.captureLayoutShift()
    setQuote(null)
  }, [scroll.captureLayoutShift, setQuote])
  const closeConfirmDialog = useCallback(
    () => setConfirmDialog(null),
    [setConfirmDialog],
  )
  const closePlans = useCallback(() => setPlansOpen(false), [setPlansOpen])
  const closeTasks = useCallback(() => setTasksOpen(false), [setTasksOpen])
  const exitDeleteMode = useCallback(
    () => applyDeleteMode(false),
    [applyDeleteMode],
  )
  const onComposerInput = useCallback(
    (value: string) => setComposerValue(value),
    [setComposerValue],
  )
  const openPlans = useCallback(() => setPlansOpen(true), [setPlansOpen])
  const openRestartDialog = useCallback(
    () => setConfirmDialog({ kind: 'restart' }),
    [setConfirmDialog],
  )
  const openResetDialog = useCallback(
    () => setConfirmDialog({ kind: 'reset' }),
    [setConfirmDialog],
  )
  const openTasks = useCallback(() => setTasksOpen(true), [setTasksOpen])
  const requestDeleteMessage = useCallback(
    (message: ChatMessage) =>
      setConfirmDialog({ kind: 'message', id: message.id ?? '' }),
    [setConfirmDialog],
  )
  const requestDeleteTask = useCallback(
    (id: string, title: string) =>
      setConfirmDialog({ kind: 'task', id, title }),
    [setConfirmDialog],
  )
  const selectQuote = useCallback(
    (message: ChatMessage) => {
      scroll.captureLayoutShift()
      setQuote(toQuoteState(message))
    },
    [scroll.captureLayoutShift, setQuote],
  )
  const toggleDeleteMode = useCallback(
    () => applyDeleteMode(!stateRef.current.deleteMode),
    [applyDeleteMode, stateRef],
  )
  const toggleTaskMenu = useCallback(
    (taskId: string) =>
      setOpenTaskMenuId((current) => (current === taskId ? '' : taskId)),
    [setOpenTaskMenuId],
  )
  const togglePlanMenu = useCallback(
    (planId: string) =>
      setOpenPlanMenuId((current) => (current === planId ? '' : planId)),
    [setOpenPlanMenuId],
  )
  const toggleToolsMenu = useCallback(
    () => setToolsMenuOpen((current) => !current),
    [setToolsMenuOpen],
  )

  return useMemo(
    () => ({
      clearQuote,
      closeConfirmDialog,
      closePlans,
      closeTasks,
      exitDeleteMode,
      onComposerInput,
      openPlans,
      openRestartDialog,
      openResetDialog,
      openTasks,
      requestDeleteMessage,
      requestDeleteTask,
      selectQuote,
      togglePlanMenu,
      toggleDeleteMode,
      toggleTaskMenu,
      toggleToolsMenu,
    }),
    [
      clearQuote,
      closeConfirmDialog,
      closePlans,
      closeTasks,
      exitDeleteMode,
      onComposerInput,
      openPlans,
      openRestartDialog,
      openResetDialog,
      openTasks,
      requestDeleteMessage,
      requestDeleteTask,
      selectQuote,
      togglePlanMenu,
      toggleDeleteMode,
      toggleTaskMenu,
      toggleToolsMenu,
    ],
  )
}
