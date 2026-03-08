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
}

export const bindDeleteMode = ({
  toolsDeleteBtn,
  toolsToggleBtn,
  composerSection,
  deleteModeExitSection,
  deleteModeExitBtn,
  input,
  messages,
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

  const onToggleDeleteMode = (event) => {
    event.preventDefault()
    if (toolsDeleteBtn.disabled) return
    closeToolsMenu(toolsToggleBtn)
    if (isDeleteMode) {
      exitDeleteMode()
      return
    }
    enterDeleteMode()
  }

  const onExitDeleteMode = (event) => {
    event.preventDefault()
    if (deleteModeExitBtn.disabled) return
    exitDeleteMode()
  }

  toolsDeleteBtn.addEventListener('click', onToggleDeleteMode)
  deleteModeExitBtn.addEventListener('click', onExitDeleteMode)

  return {
    isDeleteMode: () => isDeleteMode,
    enterDeleteMode,
    exitDeleteMode,
    dispose: () => {
      toolsDeleteBtn.removeEventListener('click', onToggleDeleteMode)
      deleteModeExitBtn.removeEventListener('click', onExitDeleteMode)
    },
  }
}
