import { bindChoicePanel } from './choice.js'
import { bindComposer } from './messages/composer.js'
import { bindDeleteMode } from './delete-mode.js'
import { createMessagesController } from './messages/controller.js'
import { bindFocusPanel, bindPlansPanel } from './panels.js'
import { bindRestart } from './restart.js'
import { bindTasksPanel } from './tasks.js'
import { bindTts } from './tts.js'
import { bindReviewStatusPanel } from './review-board.js'
import { createBrandingController } from './app-branding.js'
import { elements } from './app-elements.js'

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
const reviewStatusPanel = bindReviewStatusPanel({
  section: elements.reviewStatus,
  cardsEl: elements.reviewStatusCards,
  actionsEl: elements.reviewStatusActions,
  highlightsEl: elements.reviewStatusHighlights,
})

let tts = null
let messages = null
const branding = createBrandingController({ statusDot: elements.statusDot })
const unbindBranding = branding.bind()

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
  onReviewStatusSnapshot: (reviewStatus) =>
    reviewStatusPanel?.applySnapshot?.(reviewStatus),
  onPlansSnapshot: (plans) => plansPanel?.applyPlansSnapshot?.(plans),
  onFocusesSnapshot: (focuses) => {
    focusPanel?.applyFocusesSnapshot?.(focuses)
    branding.syncTitle(focuses)
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
    reviewStatusPanel?.setDisconnected?.()
  },
})

tts = bindTts({
  toolsTtsBtn: elements.toolsTtsBtn,
  toolsToggleBtn: elements.toolsToggleBtn,
})

branding.syncTitle(null)

bindComposer({ form: elements.form, input: elements.input, messages })
bindRestart({
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

window.addEventListener('beforeunload', () => {
  unbindBranding()
})
