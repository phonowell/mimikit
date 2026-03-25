import { useCallback, useDeferredValue } from 'react'

import { ChoicePanel } from './components/ChoicePanel.js'
import { Composer } from './components/Composer.js'
import { ConfirmDialogs } from './components/ConfirmDialogs.js'
import { FocusDialog } from './components/FocusDialog.js'
import { Header } from './components/Header.js'
import { MessageList } from './components/MessageList.js'
import { PlansDialog } from './components/PlansDialog.js'
import { TasksDialog } from './components/TasksDialog.js'
import { Toast } from './components/Toast.js'
import { useAppController } from './hooks/use-app-controller.js'

export const App = () => {
  const controller = useAppController()
  const deferredTasks = useDeferredValue(controller.appState.tasks)
  const deferredPlans = useDeferredValue(controller.appState.plans)
  const deferredFocuses = useDeferredValue(controller.appState.focuses)
  const handleConfirmDialog = useCallback(
    () => void controller.actions.confirmAction(),
    [controller.actions.confirmAction],
  )
  const handleComposerLayoutShift = useCallback(
    (stickToBottom: boolean) =>
      controller.scroll.syncAfterLayoutShift({ stickToBottom }),
    [controller.scroll.syncAfterLayoutShift],
  )
  const handleScrollBottom = useCallback(
    () => controller.scroll.scrollToBottom(true),
    [controller.scroll.scrollToBottom],
  )
  const handleToggleTts = useCallback(
    () => controller.actions.setTtsEnabled(!controller.ttsEnabled),
    [controller.actions.setTtsEnabled, controller.ttsEnabled],
  )

  return (
    <>
      <main data-app>
        <Header
          statusText={controller.displayText}
          statusState={controller.displayState}
          workerStates={controller.workerStates}
          hasPlans={controller.appState.plans.length > 0}
          toolsMenuOpen={controller.toolsMenuOpen}
          ttsLabel={controller.ttsLabel}
          toolsDisabled={controller.busy}
          onOpenFocuses={controller.actions.openFocuses}
          onOpenPlans={controller.actions.openPlans}
          onOpenTasks={controller.actions.openTasks}
          onToggleTools={controller.actions.toggleToolsMenu}
          onToggleTts={handleToggleTts}
          onToggleDeleteMode={controller.actions.toggleDeleteMode}
          onOpenRestart={controller.actions.openRestartDialog}
          onOpenReset={controller.actions.openResetDialog}
        />
        <MessageList
          messages={controller.appState.messages}
          loading={controller.appState.awaitingReply}
          deleteMode={controller.deleteMode}
          listRef={controller.scroll.listRef}
          scrollButtonVisible={controller.scroll.scrollButtonVisible}
          onScroll={controller.scroll.onScroll}
          onScrollBottom={handleScrollBottom}
          onQuote={controller.actions.selectQuote}
          onDelete={controller.actions.requestDeleteMessage}
        />
        <ChoicePanel
          choices={controller.appState.choices}
          pendingChoiceId={controller.choicePending.choiceId}
          pendingOptionId={controller.choicePending.optionId}
          choiceMetaOverrides={controller.choiceMetaOverrides}
          disconnected={controller.disconnected}
          onSelect={controller.actions.selectChoice}
        />
        {controller.deleteMode ? (
          <section
            className="delete-mode-exit"
            aria-label="Delete messages mode"
          >
            <button
              id="delete-mode-exit-btn"
              className="btn btn--md delete-mode-exit-btn"
              type="button"
              onClick={controller.actions.exitDeleteMode}
            >
              Exit delete messages
            </button>
          </section>
        ) : (
          <Composer
            value={controller.composerValue}
            sendPending={controller.sendPending}
            quoteLabel={controller.quote?.label ?? 'Quote'}
            quoteText={controller.quote?.text ?? ''}
            hasQuote={controller.quote !== null}
            isNearBottom={controller.scroll.isNearBottom}
            onChange={controller.actions.onComposerInput}
            onClearQuote={controller.actions.clearQuote}
            onLayoutShift={handleComposerLayoutShift}
            onSubmit={controller.actions.submitMessage}
          />
        )}
      </main>
      <TasksDialog
        open={controller.tasksOpen}
        tasks={deferredTasks}
        openMenuId={controller.openTaskMenuId}
        onClose={controller.actions.closeTasks}
        onToggleMenu={controller.actions.toggleTaskMenu}
        onTaskAction={controller.actions.triggerTaskAction}
        onRequestDelete={controller.actions.requestDeleteTask}
      />
      <PlansDialog
        open={controller.plansOpen}
        plans={deferredPlans}
        onClose={controller.actions.closePlans}
      />
      <FocusDialog
        open={controller.focusesOpen}
        focuses={deferredFocuses}
        onClose={controller.actions.closeFocuses}
      />
      <ConfirmDialogs
        dialog={controller.confirmDialog}
        busy={controller.busy}
        onClose={controller.actions.closeConfirmDialog}
        onConfirm={handleConfirmDialog}
      />
      <Toast toast={controller.toast} />
    </>
  )
}
