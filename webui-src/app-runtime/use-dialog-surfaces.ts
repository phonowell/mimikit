import { useCallback, useMemo } from 'react'

import type { useAppActions } from '../hooks/use-app-actions.js'
import type { useAppUiState } from '../hooks/use-app-ui-state.js'
import type { PlanView, TaskView } from '../types.js'

export const useDialogSurfaces = ({
  actions,
  confirmDialog,
  deferredPlans,
  deferredTasks,
  openPlanMenuId,
  openTaskMenuId,
  planCopyFeedback,
  plansOpen,
  setPlanCopyFeedback,
  setTaskCopyFeedback,
  taskCopyFeedback,
  tasksOpen,
  uiBusy,
}: {
  actions: ReturnType<typeof useAppActions>
  confirmDialog: ReturnType<typeof useAppUiState>['confirmDialog']
  deferredPlans: PlanView[]
  deferredTasks: TaskView[]
  openPlanMenuId: string
  openTaskMenuId: string
  planCopyFeedback: ReturnType<typeof useAppUiState>['planCopyFeedback']
  plansOpen: boolean
  setPlanCopyFeedback: ReturnType<typeof useAppUiState>['setPlanCopyFeedback']
  setTaskCopyFeedback: ReturnType<typeof useAppUiState>['setTaskCopyFeedback']
  taskCopyFeedback: ReturnType<typeof useAppUiState>['taskCopyFeedback']
  tasksOpen: boolean
  uiBusy: boolean
}) => {
  const confirmCurrentDialog = useCallback(
    () => void actions.confirmAction(),
    [actions],
  )
  const clearTaskCopyFeedback = useCallback(
    () => setTaskCopyFeedback(null),
    [setTaskCopyFeedback],
  )
  const clearPlanCopyFeedback = useCallback(
    () => setPlanCopyFeedback(null),
    [setPlanCopyFeedback],
  )
  const closeTasksDialog = useCallback(() => {
    clearTaskCopyFeedback()
    actions.closeTasks()
  }, [actions, clearTaskCopyFeedback])
  const closePlansDialog = useCallback(() => {
    clearPlanCopyFeedback()
    actions.closePlans()
  }, [actions, clearPlanCopyFeedback])

  return {
    tasksDialogSurface: useMemo(
      () => ({
        copyFeedback: taskCopyFeedback,
        open: tasksOpen,
        openMenuId: openTaskMenuId,
        onClearCopyFeedback: clearTaskCopyFeedback,
        onClose: closeTasksDialog,
        onToggleMenu: actions.toggleTaskMenu,
        onTaskAction: actions.triggerTaskAction,
        onRequestDelete: actions.requestDeleteTask,
        tasks: deferredTasks,
      }),
      [
        actions.requestDeleteTask,
        actions.toggleTaskMenu,
        actions.triggerTaskAction,
        clearTaskCopyFeedback,
        closeTasksDialog,
        deferredTasks,
        openTaskMenuId,
        taskCopyFeedback,
        tasksOpen,
      ],
    ),
    plansDialogSurface: useMemo(
      () => ({
        copyFeedback: planCopyFeedback,
        open: plansOpen,
        openMenuId: openPlanMenuId,
        onClearCopyFeedback: clearPlanCopyFeedback,
        onClose: closePlansDialog,
        onPlanAction: actions.triggerPlanAction,
        onToggleMenu: actions.togglePlanMenu,
        plans: deferredPlans,
      }),
      [
        actions.togglePlanMenu,
        actions.triggerPlanAction,
        clearPlanCopyFeedback,
        closePlansDialog,
        deferredPlans,
        openPlanMenuId,
        planCopyFeedback,
        plansOpen,
      ],
    ),
    confirmDialogsSurface: useMemo(
      () => ({
        dialog: confirmDialog,
        busy: uiBusy,
        onClose: actions.closeConfirmDialog,
        onConfirm: confirmCurrentDialog,
      }),
      [actions.closeConfirmDialog, confirmCurrentDialog, confirmDialog, uiBusy],
    ),
  }
}
