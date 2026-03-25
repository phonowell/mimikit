import { useCallback, useDeferredValue, useMemo } from 'react'

import {
  preloadFocusDialog,
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
  scroll,
  ttsEnabled,
  ttsSupported,
  ui,
}: {
  actions: ReturnType<typeof useAppActions>
  appState: AppState
  composerValue: string
  scroll: ReturnType<typeof useMessageScroll>
  ttsEnabled: boolean
  ttsSupported: boolean
  ui: ReturnType<typeof useAppUiState>
}) => {
  const deferredTasks = useDeferredValue(appState.tasks)
  const deferredPlans = useDeferredValue(appState.plans)
  const deferredFocuses = useDeferredValue(appState.focuses)
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
  const ttsLabel = !ttsSupported
    ? 'Voice replies: unavailable'
    : ttsEnabled
      ? 'Voice replies: on'
      : 'Voice replies: off'
  const toggleTts = useCallback(
    () => actions.setTtsEnabled(!ttsEnabled),
    [actions, ttsEnabled],
  )
  const syncComposerLayoutShift = useCallback(
    (stickToBottom: boolean) => scroll.syncAfterLayoutShift({ stickToBottom }),
    [scroll.syncAfterLayoutShift],
  )
  const scrollBottom = useCallback(
    () => scroll.scrollToBottom(true),
    [scroll.scrollToBottom],
  )

  const headerSurface = useMemo(
    () => ({
      statusText: displayText,
      statusState: displayState,
      workerStates,
      hasPlans: appState.plans.length > 0,
      toolsMenuOpen: ui.toolsMenuOpen,
      ttsLabel,
      toolsDisabled: ui.busy,
      onOpenFocuses: actions.openFocuses,
      onOpenPlans: actions.openPlans,
      onOpenTasks: actions.openTasks,
      onPreloadFocuses: preloadFocusDialog,
      onPreloadPlans: preloadPlansDialog,
      onPreloadTasks: preloadTasksDialog,
      onToggleTools: actions.toggleToolsMenu,
      onToggleTts: toggleTts,
      onToggleDeleteMode: actions.toggleDeleteMode,
      onOpenRestart: actions.openRestartDialog,
      onOpenReset: actions.openResetDialog,
    }),
    [
      actions,
      appState.plans.length,
      displayState,
      displayText,
      toggleTts,
      ttsLabel,
      ui.busy,
      ui.toolsMenuOpen,
      workerStates,
    ],
  )
  const messageListSurface = useMemo(
    () => ({
      messages: appState.messages,
      loading: appState.awaitingReply,
      deleteMode: ui.deleteMode,
      listRef: scroll.listRef,
      scrollButtonVisible: scroll.scrollButtonVisible,
      onScrollBottom: scrollBottom,
      onQuote: actions.selectQuote,
      onDelete: actions.requestDeleteMessage,
    }),
    [
      actions.requestDeleteMessage,
      actions.selectQuote,
      appState.awaitingReply,
      appState.messages,
      scroll.listRef,
      scroll.scrollButtonVisible,
      scrollBottom,
      ui.deleteMode,
    ],
  )
  const choicePanelSurface = useMemo(
    () => ({
      choices: appState.choices,
      choiceSubmission: ui.choiceSubmission,
      isDisconnected,
      onSelect: actions.selectChoice,
    }),
    [
      actions.selectChoice,
      appState.choices,
      isDisconnected,
      ui.choiceSubmission,
    ],
  )
  const composerSurface = useMemo(
    () => ({
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
    }),
    [
      actions.clearQuote,
      actions.exitDeleteMode,
      actions.onComposerInput,
      actions.submitMessage,
      composerValue,
      scroll.isNearBottom,
      syncComposerLayoutShift,
      ui.deleteMode,
      ui.quote,
      ui.sendPending,
    ],
  )
  const dialogSurfaces = useDialogSurfaces({
    actions,
    confirmDialog: ui.confirmDialog,
    deferredFocuses,
    deferredPlans,
    deferredTasks,
    focusesOpen: ui.focusesOpen,
    openTaskMenuId: ui.openTaskMenuId,
    plansOpen: ui.plansOpen,
    tasksOpen: ui.tasksOpen,
    toast: ui.toast,
    uiBusy: ui.busy,
  })

  return {
    headerSurface,
    messageListSurface,
    choicePanelSurface,
    composerSurface,
    ...dialogSurfaces,
  }
}
