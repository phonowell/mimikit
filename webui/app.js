import { bindComposer } from './messages/composer.js'
import { bindChoicePanel } from './choice.js'
import { bindDeleteMode } from './delete-mode.js'
import { createMessagesController } from './messages/controller.js'
import { bindFocusPanel, bindPlansPanel } from './panels.js'
import { bindRestart } from './restart.js'
import { UI_TEXT } from './system-text.js'
import { bindTasksPanel } from './tasks.js'
import { bindTts } from './tts.js'

const $ = (sel) => document.querySelector(sel)

const elements = {
  statusDot: $('[data-status-dot]'),
  statusText: $('[data-status-text]'),
  messagesEl: $('[data-messages]'),
  scrollBottomBtn: $('[data-scroll-bottom]'),
  composerSection: $('[data-composer]'),
  form: $('[data-form]'),
  input: $('[data-input]'),
  sendBtn: $('[data-send]'),
  quotePreview: $('[data-quote-preview]'),
  quoteLabel: $('[data-quote-label]'),
  quoteText: $('[data-quote-text]'),
  quoteClearBtn: $('[data-quote-clear]'),
  restartBtn: $('[data-restart]'),
  toolsToggleBtn: $('[data-tools-toggle]'),
  toolsMenu: $('[data-tools-menu]'),
  toolsDeleteBtn: $('[data-tools-delete]'),
  toolsTtsBtn: $('[data-tools-tts]'),
  toolsRestartBtn: $('[data-tools-restart]'),
  toolsResetBtn: $('[data-tools-reset]'),
  deleteModeExitSection: $('[data-delete-mode-exit]'),
  deleteModeExitBtn: $('[data-delete-mode-exit-btn]'),
  restartDialog: $('[data-restart-dialog]'),
  restartCancelBtn: $('[data-restart-cancel]'),
  restartConfirmBtn: $('[data-restart-confirm]'),
  resetDialog: $('[data-reset-dialog]'),
  resetCancelBtn: $('[data-reset-cancel]'),
  resetConfirmBtn: $('[data-reset-confirm]'),
  messageDeleteDialog: $('[data-message-delete-dialog]'),
  messageDeleteCancelBtn: $('[data-message-delete-cancel]'),
  messageDeleteConfirmBtn: $('[data-message-delete-confirm]'),
  choicePanel: $('[data-choice-panel]'),
  choiceQuestion: $('[data-choice-question]'),
  choiceOptions: $('[data-choice-options]'),
  choiceMeta: $('[data-choice-meta]'),
  tasksDialog: $('[data-tasks-dialog]'),
  tasksOpenBtn: $('[data-tasks-open]'),
  workerDots: $('[data-worker-dots]'),
  tasksCloseBtn: $('[data-tasks-close]'),
  tasksList: $('[data-tasks-list]'),
  taskDeleteDialog: $('[data-task-delete-dialog]'),
  taskDeleteCancelBtn: $('[data-task-delete-cancel]'),
  taskDeleteConfirmBtn: $('[data-task-delete-confirm]'),
  plansDialog: $('[data-plans-dialog]'),
  plansOpenBtn: $('[data-plans-open]'),
  plansCloseBtn: $('[data-plans-close]'),
  plansList: $('[data-plans-list]'),
  focusesDialog: $('[data-focuses-dialog]'),
  focusesOpenBtn: $('[data-focuses-open]'),
  focusesCloseBtn: $('[data-focuses-close]'),
  focusesList: $('[data-focuses-list]'),
}

const FAVICON_COLOR_BY_STATE = {
  idle: '#22c55e',
  running: '#0ea5e9',
  disconnected: '#94a3b8',
}

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

const normalizeFocusTitle = (value) => {
  if (typeof value !== 'string') return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact || ''
}

const resolveFocusActivityAtMs = (item) => {
  const lastActivityAt =
    typeof item?.lastActivityAt === 'string' && item.lastActivityAt.trim()
      ? item.lastActivityAt
      : typeof item?.updatedAt === 'string' && item.updatedAt.trim()
        ? item.updatedAt
        : ''
  if (!lastActivityAt) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(lastActivityAt)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

const resolveMostActiveFocusTitle = (focusesSnapshot) => {
  const rawItems = Array.isArray(focusesSnapshot?.items) ? focusesSnapshot.items : []
  if (rawItems.length === 0) return ''

  const activeCandidates = []
  const fallbackCandidates = []

  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index]
    if (!item || typeof item !== 'object') continue
    const title = normalizeFocusTitle(item.title)
    if (!title) continue

    const candidate = { item, index, title }
    fallbackCandidates.push(candidate)
    if (typeof item.status === 'string' && item.status.trim().toLowerCase() === 'active')
      activeCandidates.push(candidate)
  }

  const candidates = activeCandidates.length > 0 ? activeCandidates : fallbackCandidates
  if (candidates.length === 0) return ''

  let latestCandidate = candidates[0]
  let latestActivityAtMs = resolveFocusActivityAtMs(latestCandidate.item)

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const activityAtMs = resolveFocusActivityAtMs(candidate.item)
    if (activityAtMs > latestActivityAtMs) {
      latestCandidate = candidate
      latestActivityAtMs = activityAtMs
      continue
    }
    if (activityAtMs === latestActivityAtMs && candidate.index > latestCandidate.index)
      latestCandidate = candidate
  }

  return latestCandidate.title
}

const syncTitleWithFocusesSnapshot = (focusesSnapshot) => {
  const titleCandidate = resolveMostActiveFocusTitle(focusesSnapshot)
  document.title = titleCandidate || UI_TEXT.conversationTitleFallback
}

const tasksPanel = bindTasksPanel({
  tasksList: elements.tasksList,
  tasksDialog: elements.tasksDialog,
  tasksOpenBtn: elements.tasksOpenBtn,
  tasksCloseBtn: elements.tasksCloseBtn,
  taskDeleteConfirmDialog: elements.taskDeleteDialog,
  taskDeleteConfirmCancelBtn: elements.taskDeleteCancelBtn,
  taskDeleteConfirmBtn: elements.taskDeleteConfirmBtn,
})
const plansPanel = bindPlansPanel({
  plansList: elements.plansList,
  plansDialog: elements.plansDialog,
  plansOpenBtn: elements.plansOpenBtn,
  plansCloseBtn: elements.plansCloseBtn,
})
const focusPanel = bindFocusPanel({
  focusesList: elements.focusesList,
  focusesDialog: elements.focusesDialog,
  focusesOpenBtn: elements.focusesOpenBtn,
  focusesCloseBtn: elements.focusesCloseBtn,
})
let tts = null
let messages = null
const choicePanel = bindChoicePanel({
  panel: elements.choicePanel,
  questionEl: elements.choiceQuestion,
  optionsEl: elements.choiceOptions,
  metaEl: elements.choiceMeta,
  onPanelVisibilityWillChange: () => {
    messages?.beginChoicePanelLayoutShift?.()
  },
  onPanelVisibilityDidChange: () => {
    messages?.endChoicePanelLayoutShift?.()
  },
})

messages = createMessagesController({
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
  deleteConfirmDialog: elements.messageDeleteDialog,
  deleteConfirmCancelBtn: elements.messageDeleteCancelBtn,
  deleteConfirmBtn: elements.messageDeleteConfirmBtn,
  onTasksSnapshot: (tasks) => tasksPanel?.applyTasksSnapshot?.(tasks),
  onPlansSnapshot: (plans) =>
    plansPanel?.applyPlansSnapshot?.(plans),
  onFocusesSnapshot: (focuses) => {
    focusPanel?.applyFocusesSnapshot?.(focuses)
    syncTitleWithFocusesSnapshot(focuses)
  },
  onChoiceSnapshot: (choice) => choicePanel?.applyChoiceSnapshot?.(choice),
  onAgentMessages: (agentMessages) => {
    tts?.speakMessages?.(agentMessages)
  },
  onDisconnected: () => {
    tasksPanel?.setDisconnected?.()
    plansPanel?.setDisconnected?.()
    focusPanel?.setDisconnected?.()
    choicePanel?.setDisconnected?.()
  },
})

tts = bindTts({
  toolsTtsBtn: elements.toolsTtsBtn,
  toolsToggleBtn: elements.toolsToggleBtn,
})

syncFaviconWithStatus()
syncTitleWithFocusesSnapshot(null)
if (elements.statusDot) {
  const statusObserver = new MutationObserver(syncFaviconWithStatus)
  statusObserver.observe(elements.statusDot, {
    attributes: true,
    attributeFilter: ['data-state'],
  })
}

bindComposer({ form: elements.form, input: elements.input, messages })
bindRestart({
  restartBtn: elements.restartBtn,
  toolsToggleBtn: elements.toolsToggleBtn,
  toolsMenu: elements.toolsMenu,
  toolsRestartBtn: elements.toolsRestartBtn,
  toolsResetBtn: elements.toolsResetBtn,
  restartDialog: elements.restartDialog,
  restartCancelBtn: elements.restartCancelBtn,
  restartConfirmBtn: elements.restartConfirmBtn,
  resetDialog: elements.resetDialog,
  resetCancelBtn: elements.resetCancelBtn,
  resetConfirmBtn: elements.resetConfirmBtn,
  statusText: elements.statusText,
  statusDot: elements.statusDot,
  messages,
})
bindDeleteMode({
  toolsDeleteBtn: elements.toolsDeleteBtn,
  toolsToggleBtn: elements.toolsToggleBtn,
  composerSection: elements.composerSection,
  deleteModeExitSection: elements.deleteModeExitSection,
  deleteModeExitBtn: elements.deleteModeExitBtn,
  input: elements.input,
  messages,
})
messages.start()
if (elements.input) elements.input.focus()
