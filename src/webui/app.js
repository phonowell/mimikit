import { bindComposer } from './messages/composer.js'
import { createMessagesController } from './messages/controller.js'
import { bindRestart } from './restart.js'
import { bindTasksPanel } from './tasks.js'

const $ = (sel) => document.querySelector(sel)

const elements = {
  statusDot: $('[data-status-dot]'),
  statusText: $('[data-status-text]'),
  messagesEl: $('[data-messages]'),
  scrollBottomBtn: $('[data-scroll-bottom]'),
  form: $('[data-form]'),
  input: $('[data-input]'),
  sendBtn: $('[data-send]'),
  quotePreview: $('[data-quote-preview]'),
  quoteLabel: $('[data-quote-label]'),
  quoteText: $('[data-quote-text]'),
  quoteClearBtn: $('[data-quote-clear]'),
  restartBtn: $('[data-restart]'),
  restartDialog: $('[data-restart-dialog]'),
  restartCancelBtn: $('[data-restart-cancel]'),
  restartConfirmBtn: $('[data-restart-confirm]'),
  restartResetBtn: $('[data-restart-reset]'),
  tasksDialog: $('[data-tasks-dialog]'),
  tasksOpenBtn: $('[data-tasks-open]'),
  workerDots: $('[data-worker-dots]'),
  tasksCloseBtn: $('[data-tasks-close]'),
  tasksList: $('[data-tasks-list]'),
}

const TITLE_DOT_BY_STATE = {
  disconnected: '○',
}

const resolveTitleDot = () => {
  const state = elements.statusDot?.dataset.state?.trim()
  if (!state) return '●'
  return TITLE_DOT_BY_STATE[state] ?? '●'
}

const messages = createMessagesController({
  messagesEl: elements.messagesEl,
  scrollBottomBtn: elements.scrollBottomBtn,
  statusDot: elements.statusDot,
  statusText: elements.statusText,
  input: elements.input,
  sendBtn: elements.sendBtn,
  workerDots: elements.workerDots,
  quotePreview: elements.quotePreview,
  quoteLabel: elements.quoteLabel,
  quoteText: elements.quoteText,
  quoteClearBtn: elements.quoteClearBtn,
})

function syncTitleWithStatus() {
  if (!elements.statusText) return
  const text = elements.statusText.textContent?.trim()
  document.title =
    text && text.length > 0 ? `${resolveTitleDot()} ${text}` : 'status'
}

syncTitleWithStatus()
if (elements.statusText || elements.statusDot) {
  const observer = new MutationObserver(syncTitleWithStatus)
  if (elements.statusText) {
    observer.observe(elements.statusText, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }
  if (elements.statusDot) {
    observer.observe(elements.statusDot, {
      attributes: true,
      attributeFilter: ['data-state'],
    })
  }
}

bindComposer({ form: elements.form, input: elements.input, messages })
bindRestart({
  restartBtn: elements.restartBtn,
  restartDialog: elements.restartDialog,
  restartCancelBtn: elements.restartCancelBtn,
  restartConfirmBtn: elements.restartConfirmBtn,
  restartResetBtn: elements.restartResetBtn,
  statusText: elements.statusText,
  statusDot: elements.statusDot,
  messages,
})
bindTasksPanel({
  tasksList: elements.tasksList,
  tasksDialog: elements.tasksDialog,
  tasksOpenBtn: elements.tasksOpenBtn,
  tasksCloseBtn: elements.tasksCloseBtn,
})

messages.start()
if (elements.input) elements.input.focus()
