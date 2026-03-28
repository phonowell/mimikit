import { useState } from 'react'

import { useAppActions } from '../hooks/use-app-actions.js'
import { useAppRuntimeEffects } from '../hooks/use-app-runtime-effects.js'
import { useAppUiState } from '../hooks/use-app-ui-state.js'
import { useComposerDraft } from '../hooks/use-composer-draft.js'
import { useMessageScroll } from '../hooks/use-message-scroll.js'
import { createInitialAppState } from '../lib/messages.js'

import { AppSurfaceProviders } from './AppSurfaceProviders.js'
import { useAppSurfaces } from './use-app-surfaces.js'

import type { PropsWithChildren } from 'react'

export const AppRuntimeProvider = ({ children }: PropsWithChildren) => {
  const [appState, setAppState] = useState(createInitialAppState)
  const [composerValue, setComposerValue] = useComposerDraft()
  const ui = useAppUiState()
  const scroll = useMessageScroll([
    appState.messages,
    appState.awaitingReply,
    ui.deleteMode,
  ])

  useAppRuntimeEffects({
    appState,
    confirmDialog: ui.confirmDialog,
    plansOpen: ui.plansOpen,
    scroll,
    setAppState,
    setOpenPlanMenuId: ui.setOpenPlanMenuId,
    setOpenTaskMenuId: ui.setOpenTaskMenuId,
    setStatusOverride: ui.setStatusOverride,
    setToolsMenuOpen: ui.setToolsMenuOpen,
    tasksOpen: ui.tasksOpen,
  })

  const actions = useAppActions({
    composerValue,
    confirmDialog: ui.confirmDialog,
    deleteMode: ui.deleteMode,
    openPlanMenuId: ui.openPlanMenuId,
    openTaskMenuId: ui.openTaskMenuId,
    quote: ui.quote,
    scroll,
    sendPending: ui.sendPending,
    setAppState,
    setBusy: ui.setBusy,
    setComposerValue,
    setConfirmDialog: ui.setConfirmDialog,
    setDeleteMode: ui.setDeleteMode,
    setOpenPlanMenuId: ui.setOpenPlanMenuId,
    setOpenTaskMenuId: ui.setOpenTaskMenuId,
    setPlanCopyFeedback: ui.setPlanCopyFeedback,
    setPlansOpen: ui.setPlansOpen,
    setQuote: ui.setQuote,
    setSendPending: ui.setSendPending,
    setStatusOverride: ui.setStatusOverride,
    setTaskCopyFeedback: ui.setTaskCopyFeedback,
    setTasksOpen: ui.setTasksOpen,
    setToolsMenuOpen: ui.setToolsMenuOpen,
    toolsMenuOpen: ui.toolsMenuOpen,
  })
  const surfaces = useAppSurfaces({
    actions,
    appState,
    composerValue,
    scroll,
    ui,
  })

  return <AppSurfaceProviders {...surfaces}>{children}</AppSurfaceProviders>
}
