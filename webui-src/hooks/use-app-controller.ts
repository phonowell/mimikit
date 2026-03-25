import { useMemo, useState } from 'react'

import { resolveWorkerStates } from '../lib/controller-utils.js'
import { createInitialAppState } from '../lib/messages.js'
import { formatStatusText } from '../lib/status.js'

import { useAppActions } from './use-app-actions.js'
import { useAppRuntimeEffects } from './use-app-runtime-effects.js'
import { useAppUiState } from './use-app-ui-state.js'
import { useComposerDraft } from './use-composer-draft.js'
import { useMessageScroll } from './use-message-scroll.js'
import { useTts } from './use-tts.js'

export const useAppController = () => {
  const [appState, setAppState] = useState(createInitialAppState)
  const [composerValue, setComposerValue] = useComposerDraft()
  const ui = useAppUiState()
  const {
    enabled: ttsEnabled,
    setEnabled: setTtsEnabled,
    supported: ttsSupported,
    speakMessages,
  } = useTts()
  const scroll = useMessageScroll([
    appState.messages,
    appState.awaitingReply,
    appState.choices,
    ui.deleteMode,
  ])

  useAppRuntimeEffects({
    appState,
    scroll,
    speakMessages,
    setAppState,
    setDisconnected: ui.setDisconnected,
    setOpenTaskMenuId: ui.setOpenTaskMenuId,
    setStatusOverride: ui.setStatusOverride,
    setToast: ui.setToast,
    setToolsMenuOpen: ui.setToolsMenuOpen,
    toast: ui.toast,
  })

  const actions = useAppActions({
    composerValue,
    confirmDialog: ui.confirmDialog,
    deleteMode: ui.deleteMode,
    openTaskMenuId: ui.openTaskMenuId,
    quote: ui.quote,
    scroll,
    sendPending: ui.sendPending,
    setAppState,
    setBusy: ui.setBusy,
    setChoiceMetaOverrides: ui.setChoiceMetaOverrides,
    setChoicePending: ui.setChoicePending,
    setComposerValue,
    setConfirmDialog: ui.setConfirmDialog,
    setDeleteMode: ui.setDeleteMode,
    setFocusesOpen: ui.setFocusesOpen,
    setOpenTaskMenuId: ui.setOpenTaskMenuId,
    setPlansOpen: ui.setPlansOpen,
    setQuote: ui.setQuote,
    setSendPending: ui.setSendPending,
    setStatusOverride: ui.setStatusOverride,
    setTasksOpen: ui.setTasksOpen,
    setToast: ui.setToast,
    setToolsMenuOpen: ui.setToolsMenuOpen,
    setTtsEnabled,
    toolsMenuOpen: ui.toolsMenuOpen,
  })
  const workerStates = useMemo(
    () =>
      resolveWorkerStates(
        appState.status.maxWorkers ?? 1,
        appState.status.activeTasks ?? 0,
        ui.disconnected,
      ),
    [appState.status.activeTasks, appState.status.maxWorkers, ui.disconnected],
  )

  return {
    appState,
    busy: ui.busy,
    choiceMetaOverrides: ui.choiceMetaOverrides,
    choicePending: ui.choicePending,
    composerValue,
    confirmDialog: ui.confirmDialog,
    deleteMode: ui.deleteMode,
    disconnected: ui.disconnected,
    displayState: ui.statusOverride?.state ?? appState.status.agentStatus,
    displayText: formatStatusText(
      ui.statusOverride?.text ?? appState.status.agentStatus,
    ),
    focusesOpen: ui.focusesOpen,
    openTaskMenuId: ui.openTaskMenuId,
    plansOpen: ui.plansOpen,
    quote: ui.quote,
    scroll,
    sendPending: ui.sendPending,
    tasksOpen: ui.tasksOpen,
    toast: ui.toast,
    toolsMenuOpen: ui.toolsMenuOpen,
    ttsEnabled,
    ttsLabel: !ttsSupported
      ? 'Voice replies: unavailable'
      : ttsEnabled
        ? 'Voice replies: on'
        : 'Voice replies: off',
    workerStates,
    actions,
  }
}
