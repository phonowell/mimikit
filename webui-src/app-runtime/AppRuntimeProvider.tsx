import { useState } from 'react'

import { useAppActions } from '../hooks/use-app-actions.js'
import { useAppRuntimeEffects } from '../hooks/use-app-runtime-effects.js'
import { useAppUiState } from '../hooks/use-app-ui-state.js'
import { useComposerDraft } from '../hooks/use-composer-draft.js'
import { useMessageScroll } from '../hooks/use-message-scroll.js'
import { useTts } from '../hooks/use-tts.js'
import { createInitialAppState } from '../lib/messages.js'

import { AppSurfaceProviders } from './AppSurfaceProviders.js'
import { useAppSurfaces } from './use-app-surfaces.js'

import type { PropsWithChildren } from 'react'

export const AppRuntimeProvider = ({ children }: PropsWithChildren) => {
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
    setChoiceSubmission: ui.setChoiceSubmission,
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
  const surfaces = useAppSurfaces({
    actions,
    appState,
    composerValue,
    scroll,
    ttsEnabled,
    ttsSupported,
    ui,
  })

  return <AppSurfaceProviders {...surfaces}>{children}</AppSurfaceProviders>
}
