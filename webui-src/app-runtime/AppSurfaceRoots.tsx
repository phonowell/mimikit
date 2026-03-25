import { Suspense } from 'react'

import { ChoicePanel } from '../components/ChoicePanel.js'
import { Composer } from '../components/Composer.js'
import { ConfirmDialogs } from '../components/ConfirmDialogs.js'
import { Header } from '../components/Header.js'
import {
  LazyFocusDialog,
  LazyPlansDialog,
  LazyTasksDialog,
} from '../components/lazy-dialogs.js'
import { MessageList } from '../components/MessageList.js'
import { Toast } from '../components/Toast.js'

import {
  useChoicePanelSurface,
  useComposerSurface,
  useConfirmDialogsSurface,
  useFocusDialogSurface,
  useHeaderSurface,
  useMessageListSurface,
  usePlansDialogSurface,
  useTasksDialogSurface,
  useToastSurface,
} from './surface-contexts.js'

const HeaderRoot = () => <Header {...useHeaderSurface()} />
const MessageListRoot = () => <MessageList {...useMessageListSurface()} />
const ChoicePanelRoot = () => <ChoicePanel {...useChoicePanelSurface()} />

const ComposerRoot = () => {
  const composer = useComposerSurface()
  if (composer.deleteMode) {
    return (
      <section className="delete-mode-exit" aria-label="Delete messages mode">
        <button
          id="delete-mode-exit-btn"
          className="btn btn--md delete-mode-exit-btn"
          type="button"
          onClick={composer.onExitDeleteMode}
        >
          Exit delete messages
        </button>
      </section>
    )
  }

  return (
    <Composer
      value={composer.value}
      sendPending={composer.sendPending}
      quoteLabel={composer.quote?.label ?? 'Quote'}
      quoteText={composer.quote?.text ?? ''}
      quoteRole={composer.quote?.role ?? 'unknown'}
      hasQuote={composer.quote !== null}
      isNearBottom={composer.isNearBottom}
      onChange={composer.onChange}
      onClearQuote={composer.onClearQuote}
      onLayoutShift={composer.onLayoutShift}
      onSubmit={composer.onSubmit}
    />
  )
}

const DialogRoots = () => {
  const tasks = useTasksDialogSurface()
  const plans = usePlansDialogSurface()
  const focuses = useFocusDialogSurface()
  const confirm = useConfirmDialogsSurface()

  return (
    <>
      <Suspense fallback={null}>
        {tasks.open ? <LazyTasksDialog {...tasks} /> : null}
        {plans.open ? <LazyPlansDialog {...plans} /> : null}
        {focuses.open ? <LazyFocusDialog {...focuses} /> : null}
      </Suspense>
      <ConfirmDialogs {...confirm} />
    </>
  )
}

const ToastRoot = () => <Toast {...useToastSurface()} />

export const AppSurfaceRoots = () => (
  <>
    <main data-app>
      <HeaderRoot />
      <MessageListRoot />
      <ChoicePanelRoot />
      <ComposerRoot />
    </main>
    <DialogRoots />
    <ToastRoot />
  </>
)
