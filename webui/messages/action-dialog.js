import { createDialogController } from '../dialog.js'

const normalizeActionName = (name) => {
  if (typeof name !== 'string') return 'unknown'
  const normalized = name.trim()
  return normalized || 'unknown'
}

const normalizeActionCommand = (command) => {
  if (typeof command !== 'string') return ''
  return command.trim()
}

export const createActionDialog = ({
  dialog,
  closeBtn,
  titleEl,
  commandEl,
} = {}) => {
  if (!(dialog instanceof HTMLDialogElement))
    return {
      open: () => {},
      close: () => {},
      destroy: () => {},
    }

  const controller = createDialogController({
    dialog,
    focusOnOpen: closeBtn instanceof HTMLElement ? closeBtn : null,
    focusOnClose: null,
  })

  const handleCloseClick = (event) => {
    event.preventDefault()
    controller.close()
  }

  const handleDialogClick = (event) => {
    controller.handleDialogClick(event)
  }

  const handleDialogClose = () => {
    controller.handleDialogClose()
  }

  const handleDialogCancel = (event) => {
    controller.handleDialogCancel(event)
  }

  if (closeBtn instanceof HTMLElement)
    closeBtn.addEventListener('click', handleCloseClick)

  dialog.addEventListener('click', handleDialogClick)
  dialog.addEventListener('close', handleDialogClose)
  dialog.addEventListener('cancel', handleDialogCancel)

  const open = (action) => {
    const actionName = normalizeActionName(action?.name)
    const actionCommand = normalizeActionCommand(action?.command)
    if (titleEl) titleEl.textContent = `M:${actionName}`
    if (commandEl) commandEl.textContent = actionCommand
    controller.open()
  }

  const close = () => {
    controller.close()
  }

  const destroy = () => {
    if (closeBtn instanceof HTMLElement)
      closeBtn.removeEventListener('click', handleCloseClick)

    dialog.removeEventListener('click', handleDialogClick)
    dialog.removeEventListener('close', handleDialogClose)
    dialog.removeEventListener('cancel', handleDialogCancel)
  }

  return {
    open,
    close,
    destroy,
  }
}
