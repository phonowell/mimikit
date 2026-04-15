import { useDeferredValue } from 'react'

import {
  preloadPlansDialog,
  preloadTasksDialog,
} from '../components/lazy-dialogs.js'
import { resolveWorkerStates } from '../lib/controller-utils.js'
import { formatStatusText } from '../lib/status.js'

import { useDialogSurfaces } from './use-dialog-surfaces.js'

import type { useAppActions } from '../hooks/use-app-actions.js'
import type { useAppUiState } from '../hooks/use-app-ui-state.js'
import type { useMessageScroll } from '../hooks/use-message-scroll.js'
import type { AppState } from '../types.js'

export const useAppSurfaces = ({
  actions,
  appState,
  composerValue,
  qualitySummary,
  scroll,
  ui,
}: {
  actions: ReturnType<typeof useAppActions>
  appState: AppState
  composerValue: string
  qualitySummary: string
  scroll: ReturnType<typeof useMessageScroll>
  ui: ReturnType<typeof useAppUiState>
}) => {
  const deferredTasks = useDeferredValue(appState.tasks)
  const deferredPlans = useDeferredValue(appState.plans)
  const isDisconnected =
    appState.status.agentStatus.trim().toLowerCase() === 'disconnected'
  const displayState = ui.statusOverride?.state ?? appState.status.agentStatus
  const displayText = formatStatusText(
    ui.statusOverride?.text ?? appState.status.agentStatus,
  )
  const workerStates = resolveWorkerStates(
    appState.status.maxWorkers ?? 1,
    appState.status.activeTasks ?? 0,
    isDisconnected,
  )
  const syncComposerLayoutShift = (stickToBottom: boolean) =>
    scroll.syncAfterLayoutShift({ stickToBottom })
  const scrollBottom = () => scroll.scrollToBottom(false)

  const headerSurface = {
    statusText: displayText,
    statusState: displayState,
    qualitySummary,
    workerStates,
    hasPlans: appState.plans.length > 0,
    toolsMenuOpen: ui.toolsMenuOpen,
    toolsDisabled: ui.busy,
    onOpenPlans: actions.openPlans,
    onOpenTasks: actions.openTasks,
    onPreloadPlans: preloadPlansDialog,
    onPreloadTasks: preloadTasksDialog,
    onToggleTools: actions.toggleToolsMenu,
    onToggleDeleteMode: actions.toggleDeleteMode,
    onOpenRestart: actions.openRestartDialog,
    onOpenReset: actions.openResetDialog,
  }
  const messageListSurface = {
    messages: appState.messages,
    loading: appState.awaitingReply,
    deleteMode: ui.deleteMode,
    listRef: scroll.listRef,
    scrollButtonVisible: scroll.scrollButtonVisible,
    onScrollBottom: scrollBottom,
    onQuote: actions.selectQuote,
    onDelete: actions.requestDeleteMessage,
  }
  const composerSurface = {
    deleteMode: ui.deleteMode,
    value: composerValue,
    sendPending: ui.sendPending,
    quote: ui.quote,
    isNearBottom: scroll.isNearBottom,
    onChange: actions.onComposerInput,
    onClearQuote: actions.clearQuote,
    onLayoutShift: syncComposerLayoutShift,
    onSubmit: actions.submitMessage,
    onExitDeleteMode: actions.exitDeleteMode,
  }
  const dialogSurfaces = useDialogSurfaces({
    actions,
    confirmDialog: ui.confirmDialog,
    deferredPlans,
    deferredTasks,
    openPlanMenuId: ui.openPlanMenuId,
    openTaskMenuId: ui.openTaskMenuId,
    plansOpen: ui.plansOpen,
    tasksOpen: ui.tasksOpen,
    uiBusy: ui.busy,
  })

  return {
    headerSurface,
    messageListSurface,
    composerSurface,
    ...dialogSurfaces,
  }
}
