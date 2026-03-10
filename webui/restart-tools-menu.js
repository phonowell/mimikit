import { createAnchoredMenuController } from './anchored-menu.js'

export const createToolsMenuController = ({
  toolsToggleBtn,
  toolsMenu,
} = {}) => {
  const menu = createAnchoredMenuController({
    trigger: toolsToggleBtn,
    menu: toolsMenu,
  })
  if (toolsToggleBtn instanceof HTMLButtonElement)
    toolsToggleBtn.setAttribute('aria-expanded', 'false')
  menu.close()

  return {
    bind: menu.bind,
    close: ({ focusTrigger = false } = {}) => {
      menu.close({ focusTrigger })
    },
    isOpen: menu.isOpen,
    setDisabled: menu.setDisabled,
    dispose: menu.dispose,
  }
}
