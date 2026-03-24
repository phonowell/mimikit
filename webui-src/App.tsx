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
          onToggleTts={() =>
            controller.actions.setTtsEnabled(!controller.ttsEnabled)
          }
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
          onScrollBottom={() => controller.scroll.scrollToBottom(true)}
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
            onLayoutShift={(stickToBottom) =>
              controller.scroll.syncAfterLayoutShift({ stickToBottom })
            }
            onSubmit={controller.actions.submitMessage}
          />
        )}
      </main>
      <TasksDialog
        open={controller.tasksOpen}
        tasks={controller.appState.tasks}
        openMenuId={controller.openTaskMenuId}
        onClose={controller.actions.closeTasks}
        onToggleMenu={controller.actions.toggleTaskMenu}
        onTaskAction={controller.actions.triggerTaskAction}
        onRequestDelete={controller.actions.requestDeleteTask}
      />
      <PlansDialog
        open={controller.plansOpen}
        plans={controller.appState.plans}
        onClose={controller.actions.closePlans}
      />
      <FocusDialog
        open={controller.focusesOpen}
        focuses={controller.appState.focuses}
        onClose={controller.actions.closeFocuses}
      />
      <ConfirmDialogs
        dialog={controller.confirmDialog}
        busy={controller.busy}
        onClose={controller.actions.closeConfirmDialog}
        onConfirm={() => void controller.actions.confirmAction()}
      />
      <Toast toast={controller.toast} />
    </>
  )
}
