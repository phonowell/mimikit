import { UI_TEXT } from './system-text.js'

const defaultConfirmDeleteModeEntry = () => {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm(UI_TEXT.deleteModeConfirmPrompt)
}

const setSectionVisible = (section, visible) => {
  if (!section) return
  section.hidden = !visible
  section.setAttribute('aria-hidden', visible ? 'false' : 'true')
}

const closeToolsMenu = (toolsToggleBtn) => {
  if (!toolsToggleBtn) return
  const expanded = toolsToggleBtn.getAttribute('aria-expanded')
  if (expanded !== 'true') return
  if (typeof toolsToggleBtn.click === 'function') toolsToggleBtn.click()
  else toolsToggleBtn.setAttribute('aria-expanded', 'false')
}

export const bindDeleteMode = ({
  toolsDeleteBtn,
  toolsToggleBtn,
  composerSection,
  deleteModeExitSection,
  deleteModeExitBtn,
  input,
  messages,
  confirmDeleteModeEntry = defaultConfirmDeleteModeEntry,
} = {}) => {
  if (
    !toolsDeleteBtn ||
    !composerSection ||
    !deleteModeExitSection ||
    !deleteModeExitBtn ||
    !messages ||
    typeof messages.setDeleteMode !== 'function'
  ) {
    return {
      isDeleteMode: () => false,
      enterDeleteMode: () => false,
      exitDeleteMode: () => false,
      dispose: () => {},
    }
  }

  let isDeleteMode = false
  setSectionVisible(composerSection, true)
  setSectionVisible(deleteModeExitSection, false)

  const enterDeleteMode = () => {
    if (isDeleteMode) return true
    const confirmed =
      typeof confirmDeleteModeEntry === 'function'
        ? Boolean(confirmDeleteModeEntry())
        : true
    if (!confirmed) return false
    isDeleteMode = true
    messages.setDeleteMode(true)
    setSectionVisible(composerSection, false)
    setSectionVisible(deleteModeExitSection, true)
    if (typeof deleteModeExitBtn.focus === 'function') deleteModeExitBtn.focus()
    return true
  }

  const exitDeleteMode = () => {
    if (!isDeleteMode) return false
    isDeleteMode = false
    messages.setDeleteMode(false)
    setSectionVisible(deleteModeExitSection, false)
    setSectionVisible(composerSection, true)
    if (input && typeof input.focus === 'function') input.focus()
    return true
  }

  const onOpenDeleteMode = (event) => {
    event.preventDefault()
    if (toolsDeleteBtn.disabled) return
    closeToolsMenu(toolsToggleBtn)
    enterDeleteMode()
  }

  const onExitDeleteMode = (event) => {
    event.preventDefault()
    if (deleteModeExitBtn.disabled) return
    exitDeleteMode()
  }

  toolsDeleteBtn.addEventListener('click', onOpenDeleteMode)
  deleteModeExitBtn.addEventListener('click', onExitDeleteMode)

  return {
    isDeleteMode: () => isDeleteMode,
    enterDeleteMode,
    exitDeleteMode,
    dispose: () => {
      toolsDeleteBtn.removeEventListener('click', onOpenDeleteMode)
      deleteModeExitBtn.removeEventListener('click', onExitDeleteMode)
    },
  }
}
