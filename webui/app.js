import { bindComposer } from './messages/composer.js'
import { createMessagesController } from './messages/controller.js'
import { bindRestart } from './restart.js'
import { UI_TEXT } from './system-text.js'
import { bindTasksPanel } from './tasks.js'
import { bindTodosPanel } from './todos.js'

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
  todosDialog: $('[data-todos-dialog]'),
  todosOpenBtn: $('[data-todos-open]'),
  todosCloseBtn: $('[data-todos-close]'),
  todosList: $('[data-todos-list]'),
}

const FAVICON_COLOR_BY_STATE = {
  idle: '#22c55e',
  running: '#0ea5e9',
  disconnected: '#94a3b8',
}
const TITLE_MAX_CHARS = 52

const resolveStatusState = () => {
  const state = elements.statusDot?.dataset.state?.trim()?.toLowerCase()
  if (!state) return 'disconnected'
  return state
}

let faviconLinkEl = null

const resolveFaviconColor = () => {
  const state = resolveStatusState()
  return FAVICON_COLOR_BY_STATE[state] ?? FAVICON_COLOR_BY_STATE.disconnected
}

const buildStatusFaviconHref = (color) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="${color}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const ensureFaviconLink = () => {
  if (faviconLinkEl instanceof HTMLLinkElement) return faviconLinkEl
  const existing = document.querySelector('link[rel="icon"]')
  if (existing instanceof HTMLLinkElement) {
    faviconLinkEl = existing
    return faviconLinkEl
  }
  const link = document.createElement('link')
  link.rel = 'icon'
  document.head.appendChild(link)
  faviconLinkEl = link
  return faviconLinkEl
}

const syncFaviconWithStatus = () => {
  const link = ensureFaviconLink()
  const href = buildStatusFaviconHref(resolveFaviconColor())
  if (link.href === href) return
  link.href = href
}

const normalizeTitleText = (value) => {
  if (typeof value !== 'string') return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  if (compact.length <= TITLE_MAX_CHARS) return compact
  return `${compact.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
}

const resolveConversationTitleCandidate = () => {
  if (!elements.messagesEl) return ''
  const selectors = ['.message.user .content', '.message:not(.system) .content']
  for (const selector of selectors) {
    const nodes = elements.messagesEl.querySelectorAll(selector)
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]
      if (!(node instanceof HTMLElement)) continue
      const text = normalizeTitleText(node.textContent ?? '')
      if (text) return text
    }
  }
  return ''
}

const syncTitleWithConversationTitleCandidate = () => {
  const titleCandidate = resolveConversationTitleCandidate()
  document.title = titleCandidate || UI_TEXT.conversationTitleFallback
}

const tasksPanel = bindTasksPanel({
  tasksList: elements.tasksList,
  tasksDialog: elements.tasksDialog,
  tasksOpenBtn: elements.tasksOpenBtn,
  tasksCloseBtn: elements.tasksCloseBtn,
})
const todosPanel = bindTodosPanel({
  todosList: elements.todosList,
  todosDialog: elements.todosDialog,
  todosOpenBtn: elements.todosOpenBtn,
  todosCloseBtn: elements.todosCloseBtn,
})

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
  onTasksSnapshot: (tasks) => tasksPanel?.applyTasksSnapshot?.(tasks),
  onTodosSnapshot: (todos) => todosPanel?.applyTodosSnapshot?.(todos),
  onDisconnected: () => {
    tasksPanel?.setDisconnected?.()
    todosPanel?.setDisconnected?.()
  },
})

syncFaviconWithStatus()
syncTitleWithConversationTitleCandidate()
if (elements.statusDot) {
  const statusObserver = new MutationObserver(syncFaviconWithStatus)
  statusObserver.observe(elements.statusDot, {
    attributes: true,
    attributeFilter: ['data-state'],
  })
}
if (elements.messagesEl) {
  const messagesObserver = new MutationObserver(
    syncTitleWithConversationTitleCandidate,
  )
  messagesObserver.observe(elements.messagesEl, {
    childList: true,
    characterData: true,
    subtree: true,
  })
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
messages.start()
if (elements.input) elements.input.focus()
