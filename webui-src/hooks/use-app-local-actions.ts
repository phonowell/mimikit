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
  const applyDeleteMode = (nextDeleteMode: boolean) => {
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
  }

  const clearQuote = () => {
    scroll.captureLayoutShift()
    setQuote(null)
  }
  const closeConfirmDialog = () => setConfirmDialog(null)
  const closePlans = () => setPlansOpen(false)
  const closeTasks = () => setTasksOpen(false)
  const exitDeleteMode = () => applyDeleteMode(false)
  const onComposerInput = (value: string) => setComposerValue(value)
  const openPlans = () => setPlansOpen(true)
  const openRestartDialog = () => setConfirmDialog({ kind: 'restart' })
  const openResetDialog = () => setConfirmDialog({ kind: 'reset' })
  const openTasks = () => setTasksOpen(true)
  const requestDeleteMessage = (message: ChatMessage) =>
    setConfirmDialog({ kind: 'message', id: message.id ?? '' })
  const requestDeleteTask = (id: string, title: string) =>
    setConfirmDialog({ kind: 'task', id, title })
  const selectQuote = (message: ChatMessage) => {
    scroll.captureLayoutShift()
    setQuote(toQuoteState(message))
  }
  const toggleDeleteMode = () => applyDeleteMode(!stateRef.current.deleteMode)
  const toggleTaskMenu = (taskId: string) =>
    setOpenTaskMenuId((current) => (current === taskId ? '' : taskId))
  const togglePlanMenu = (planId: string) =>
    setOpenPlanMenuId((current) => (current === planId ? '' : planId))
  const toggleToolsMenu = () => setToolsMenuOpen((current) => !current)

  return {
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
  }
}
