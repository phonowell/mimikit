import { selectAppElements } from './dom.js'
import { bindComposer, createMessagesController } from './messages.js'
import { bindRestart } from './restart.js'
import { bindTasksModal } from './tasks.js'

const elements = selectAppElements()
const messages = createMessagesController({
  messagesEl: elements.messagesEl,
  statusDot: elements.statusDot,
  statusText: elements.statusText,
  input: elements.input,
  sendBtn: elements.sendBtn,
})

bindComposer({ form: elements.form, input: elements.input, messages })
bindRestart({
  restartBtn: elements.restartBtn,
  statusText: elements.statusText,
  statusDot: elements.statusDot,
  messages,
})
bindTasksModal({
  tasksBtn: elements.tasksBtn,
  tasksModal: elements.tasksModal,
  tasksList: elements.tasksList,
  tasksMeta: elements.tasksMeta,
  tasksCloseBtn: elements.tasksCloseBtn,
})

messages.start()
if (elements.input) elements.input.focus()
