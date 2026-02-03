import { selectAppElements } from './dom.js'
import { bindComposer, createMessagesController } from './messages.js'
import { bindRestart } from './restart.js'
import { bindTasksPanel } from './tasks.js'

const elements = selectAppElements()
const messages = createMessagesController({
  messagesEl: elements.messagesEl,
  scrollBottomBtn: elements.scrollBottomBtn,
  statusDot: elements.statusDot,
  statusText: elements.statusText,
  input: elements.input,
  sendBtn: elements.sendBtn,
})

function syncTitleWithStatus() {
  if (!elements.statusText) return
  const text = elements.statusText.textContent?.trim()
  document.title = text && text.length > 0 ? text : 'status'
}

syncTitleWithStatus()
if (elements.statusText) {
  const observer = new MutationObserver(syncTitleWithStatus)
  observer.observe(elements.statusText, {
    childList: true,
    characterData: true,
    subtree: true,
  })
}

bindComposer({ form: elements.form, input: elements.input, messages })
bindRestart({
  restartBtn: elements.restartBtn,
  statusText: elements.statusText,
  statusDot: elements.statusDot,
  messages,
})
bindTasksPanel({
  tasksList: elements.tasksList,
  tasksMeta: elements.tasksMeta,
  tasksDialog: elements.tasksDialog,
  tasksOpenBtn: elements.tasksOpenBtn,
  tasksCloseBtn: elements.tasksCloseBtn,
})

messages.start()
if (elements.input) elements.input.focus()
