import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { renderTodos } from './todos-view.js'

const EMPTY_TODOS = { items: [] }

const normalizeTodosPayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_TODOS
  const items = Array.isArray(value.items) ? value.items : []
  return { items }
}

export function bindTodosPanel({
  todosList,
  todosDialog,
  todosOpenBtn,
  todosCloseBtn,
}) {
  if (!todosList) {
    return {
      applyTodosSnapshot: () => {},
      setDisconnected: () => {},
      dispose: () => {},
    }
  }

  let latestTodos = EMPTY_TODOS

  const renderLatestTodos = () => {
    renderTodos(todosList, latestTodos)
  }

  const applyTodosSnapshot = (payload) => {
    latestTodos = normalizeTodosPayload(payload)
    renderLatestTodos()
  }

  const setDisconnected = () => {
    todosList.innerHTML = ''
    const empty = document.createElement('li')
    empty.className = 'todos-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.connectionLost
    empty.appendChild(article)
    todosList.appendChild(empty)
  }

  const dialogEnabled = Boolean(todosDialog && todosOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: todosDialog,
        trigger: todosOpenBtn,
        focusOnOpen: todosCloseBtn,
        focusOnClose: todosOpenBtn,
        onOpen: renderLatestTodos,
      })
    : null

  const onOpen = (event) => {
    event.preventDefault()
    if (dialog) dialog.open()
  }
  const onClose = (event) => {
    event.preventDefault()
    if (dialog) dialog.close()
  }
  const onDialogClick = (event) => {
    if (dialog) dialog.handleDialogClick(event)
  }
  const onDialogClose = () => {
    if (dialog) dialog.handleDialogClose()
  }
  const onDialogCancel = (event) => {
    if (dialog) dialog.handleDialogCancel(event)
  }

  if (dialogEnabled && dialog) {
    dialog.setExpanded(false)
    todosOpenBtn.addEventListener('click', onOpen)
    if (todosCloseBtn) todosCloseBtn.addEventListener('click', onClose)
    todosDialog.addEventListener('click', onDialogClick)
    todosDialog.addEventListener('cancel', onDialogCancel)
    todosDialog.addEventListener('close', onDialogClose)
  } else renderLatestTodos()

  return {
    applyTodosSnapshot,
    setDisconnected,
    dispose: () => {
      if (dialogEnabled && dialog) {
        todosOpenBtn.removeEventListener('click', onOpen)
        if (todosCloseBtn) todosCloseBtn.removeEventListener('click', onClose)
        todosDialog.removeEventListener('click', onDialogClick)
        todosDialog.removeEventListener('cancel', onDialogCancel)
        todosDialog.removeEventListener('close', onDialogClose)
      }
    },
  }
}

