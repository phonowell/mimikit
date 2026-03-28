import { Suspense } from 'react'

import { Composer } from '../components/Composer.js'
import { ConfirmDialogs } from '../components/ConfirmDialogs.js'
import { Header } from '../components/Header.js'
import { LazyPlansDialog, LazyTasksDialog } from '../components/lazy-dialogs.js'
import { MessageList } from '../components/MessageList.js'

import {
  useComposerSurface,
  useConfirmDialogsSurface,
  useHeaderSurface,
  useMessageListSurface,
  usePlansDialogSurface,
  useTasksDialogSurface,
} from './surface-contexts.js'

const HeaderRoot = () => <Header {...useHeaderSurface()} />
const MessageListRoot = () => <MessageList {...useMessageListSurface()} />

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
  const confirm = useConfirmDialogsSurface()

  return (
    <>
      <Suspense fallback={null}>
        {tasks.open ? <LazyTasksDialog {...tasks} /> : null}
        {plans.open ? <LazyPlansDialog {...plans} /> : null}
      </Suspense>
      <ConfirmDialogs {...confirm} />
    </>
  )
}

export const AppSurfaceRoots = () => (
  <>
    <main data-app>
      <HeaderRoot />
      <MessageListRoot />
      <ComposerRoot />
    </main>
    <DialogRoots />
  </>
)
