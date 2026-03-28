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
  plansOpen,
  tasksOpen,
  uiBusy,
}: {
  actions: ReturnType<typeof useAppActions>
  confirmDialog: ReturnType<typeof useAppUiState>['confirmDialog']
  deferredPlans: PlanView[]
  deferredTasks: TaskView[]
  openPlanMenuId: string
  openTaskMenuId: string
  plansOpen: boolean
  tasksOpen: boolean
  uiBusy: boolean
}) => {
  const confirmCurrentDialog = useCallback(
    () => void actions.confirmAction(),
    [actions],
  )
  const closeTasksDialog = useCallback(() => actions.closeTasks(), [actions])
  const closePlansDialog = useCallback(() => actions.closePlans(), [actions])

  return {
    tasksDialogSurface: useMemo(
      () => ({
        open: tasksOpen,
        openMenuId: openTaskMenuId,
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
        closeTasksDialog,
        deferredTasks,
        openTaskMenuId,
        tasksOpen,
      ],
    ),
    plansDialogSurface: useMemo(
      () => ({
        open: plansOpen,
        openMenuId: openPlanMenuId,
        onClose: closePlansDialog,
        onPlanAction: actions.triggerPlanAction,
        onToggleMenu: actions.togglePlanMenu,
        plans: deferredPlans,
      }),
      [
        actions.togglePlanMenu,
        actions.triggerPlanAction,
        closePlansDialog,
        deferredPlans,
        openPlanMenuId,
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
