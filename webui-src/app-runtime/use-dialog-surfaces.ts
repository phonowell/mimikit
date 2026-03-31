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
  const confirmCurrentDialog = () => void actions.confirmAction()
  const closeTasksDialog = () => actions.closeTasks()
  const closePlansDialog = () => actions.closePlans()

  return {
    tasksDialogSurface: {
      open: tasksOpen,
      openMenuId: openTaskMenuId,
      onClose: closeTasksDialog,
      onToggleMenu: actions.toggleTaskMenu,
      onTaskAction: actions.triggerTaskAction,
      onRequestDelete: actions.requestDeleteTask,
      tasks: deferredTasks,
    },
    plansDialogSurface: {
      open: plansOpen,
      openMenuId: openPlanMenuId,
      onClose: closePlansDialog,
      onPlanAction: actions.triggerPlanAction,
      onToggleMenu: actions.togglePlanMenu,
      plans: deferredPlans,
    },
    confirmDialogsSurface: {
      dialog: confirmDialog,
      busy: uiBusy,
      onClose: actions.closeConfirmDialog,
      onConfirm: confirmCurrentDialog,
    },
  }
}
