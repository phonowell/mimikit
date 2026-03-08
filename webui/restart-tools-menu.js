import { createAnchoredMenuController } from './anchored-menu.js'

const createNoopToolsMenuController = () => ({
  bind: () => () => {},
  close: () => {},
  isOpen: () => false,
  setDisabled: () => {},
  dispose: () => {},
})

export const createToolsMenuController = ({
  toolsToggleBtn,
  toolsMenu,
} = {}) => {
  if (!(toolsToggleBtn instanceof HTMLButtonElement))
    return createNoopToolsMenuController()
  if (!(toolsMenu instanceof HTMLElement)) return createNoopToolsMenuController()

  const menu = createAnchoredMenuController({
    trigger: toolsToggleBtn,
    menu: toolsMenu,
  })
  toolsToggleBtn.setAttribute('aria-expanded', 'false')
  menu.close()

  return {
    bind: () => menu.bind(),
    close: ({ focusTrigger = false } = {}) => {
      menu.close({ focusTrigger })
    },
    isOpen: () => menu.isOpen(),
    setDisabled: (disabled) => menu.setDisabled(disabled),
    dispose: () => menu.dispose(),
  }
}
