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
  toast,
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
  toast: ReturnType<typeof useAppUiState>['toast']
  uiBusy: boolean
}) => {
  const confirmCurrentDialog = useCallback(
    () => void actions.confirmAction(),
    [actions],
  )

  return {
    tasksDialogSurface: useMemo(
      () => ({
        open: tasksOpen,
        tasks: deferredTasks,
        openMenuId: openTaskMenuId,
        onClose: actions.closeTasks,
        onToggleMenu: actions.toggleTaskMenu,
        onTaskAction: actions.triggerTaskAction,
        onRequestDelete: actions.requestDeleteTask,
      }),
      [
        actions.closeTasks,
        actions.requestDeleteTask,
        actions.toggleTaskMenu,
        actions.triggerTaskAction,
        deferredTasks,
        openTaskMenuId,
        tasksOpen,
      ],
    ),
    plansDialogSurface: useMemo(
      () => ({
        open: plansOpen,
        openMenuId: openPlanMenuId,
        plans: deferredPlans,
        onClose: actions.closePlans,
        onPlanAction: actions.triggerPlanAction,
        onToggleMenu: actions.togglePlanMenu,
      }),
      [
        actions.closePlans,
        actions.togglePlanMenu,
        actions.triggerPlanAction,
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
    toastSurface: useMemo(() => ({ toast }), [toast]),
  }
}
