import { Suspense, useState } from 'react'

import { Composer } from '../components/Composer.js'
import { ConfirmDialogs } from '../components/ConfirmDialogs.js'
import { Header } from '../components/Header.js'
import { LazyPlansDialog, LazyTasksDialog } from '../components/lazy-dialogs.js'
import { MessageList } from '../components/MessageList.js'
import { Toast } from '../components/Toast.js'
import { useAppActions } from '../hooks/use-app-actions.js'
import { useAppRuntimeEffects } from '../hooks/use-app-runtime-effects.js'
import { useAppUiState } from '../hooks/use-app-ui-state.js'
import { useComposerDraft } from '../hooks/use-composer-draft.js'
import { useMessageScroll } from '../hooks/use-message-scroll.js'
import { createInitialAppState } from '../lib/messages.js'

import { useAppSurfaces } from './use-app-surfaces.js'

type AppRuntimeShellProps = ReturnType<typeof useAppSurfaces>

const DeleteModeExit = ({
  onExit,
}: {
  onExit: AppRuntimeShellProps['composerSurface']['onExitDeleteMode']
}) => (
  <section className="delete-mode-exit" aria-label="Delete messages mode">
    <button
      id="delete-mode-exit-btn"
      className="btn btn--md delete-mode-exit-btn"
      type="button"
      onClick={onExit}
    >
      Exit delete messages
    </button>
  </section>
)

const RuntimeDialogs = ({
  confirmDialogsSurface,
  plansDialogSurface,
  tasksDialogSurface,
}: Pick<
  AppRuntimeShellProps,
  'confirmDialogsSurface' | 'plansDialogSurface' | 'tasksDialogSurface'
>) => (
  <>
    <Suspense fallback={null}>
      {tasksDialogSurface.open ? (
        <LazyTasksDialog {...tasksDialogSurface} />
      ) : null}
      {plansDialogSurface.open ? (
        <LazyPlansDialog {...plansDialogSurface} />
      ) : null}
    </Suspense>
    <ConfirmDialogs {...confirmDialogsSurface} />
  </>
)

export const AppRuntimeShell = ({
  composerSurface,
  confirmDialogsSurface,
  headerSurface,
  messageListSurface,
  plansDialogSurface,
  tasksDialogSurface,
  toastSurface,
}: AppRuntimeShellProps) => (
  <>
    <main data-app>
      <Header {...headerSurface} />
      <MessageList {...messageListSurface} />
      {composerSurface.deleteMode ? (
        <DeleteModeExit onExit={composerSurface.onExitDeleteMode} />
      ) : (
        <Composer
          value={composerSurface.value}
          sendPending={composerSurface.sendPending}
          quoteLabel={composerSurface.quote?.label ?? 'Quote'}
          quoteText={composerSurface.quote?.text ?? ''}
          quoteRole={composerSurface.quote?.role ?? 'unknown'}
          hasQuote={composerSurface.quote !== null}
          isNearBottom={composerSurface.isNearBottom}
          onChange={composerSurface.onChange}
          onClearQuote={composerSurface.onClearQuote}
          onLayoutShift={composerSurface.onLayoutShift}
          onSubmit={composerSurface.onSubmit}
        />
      )}
    </main>
    <RuntimeDialogs
      confirmDialogsSurface={confirmDialogsSurface}
      plansDialogSurface={plansDialogSurface}
      tasksDialogSurface={tasksDialogSurface}
    />
    <Toast {...toastSurface} />
  </>
)

export const AppRuntime = () => {
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
    setToast: ui.setToast,
    setToolsMenuOpen: ui.setToolsMenuOpen,
    tasksOpen: ui.tasksOpen,
    toast: ui.toast,
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
    setPlansOpen: ui.setPlansOpen,
    setQuote: ui.setQuote,
    setSendPending: ui.setSendPending,
    setStatusOverride: ui.setStatusOverride,
    setTasksOpen: ui.setTasksOpen,
    setToast: ui.setToast,
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

  return <AppRuntimeShell {...surfaces} />
}
