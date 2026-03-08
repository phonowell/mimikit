import { createAnchoredMenuController } from './anchored-menu.js'

const resolveActionsElements = (actions) => {
  if (!(actions instanceof Element)) return null
  const toggle = actions.querySelector('[data-task-more-toggle]')
  const menu = actions.querySelector('.task-more-menu')
  if (!(toggle instanceof HTMLButtonElement)) return null
  if (!(menu instanceof HTMLElement)) return null
  return {
    toggle,
    menu,
    menuController: createAnchoredMenuController({
      trigger: toggle,
      menu,
    }),
  }
}

const actionsElementsCache = new WeakMap()

const getActionsElements = (actions) => {
  if (!(actions instanceof HTMLElement)) return null
  const cached = actionsElementsCache.get(actions)
  if (cached) return cached
  const resolved = resolveActionsElements(actions)
  if (!resolved) return null
  actionsElementsCache.set(actions, resolved)
  return resolved
}

const forEachActions = (tasksList, run) => {
  const actions = tasksList.querySelectorAll('.task-item-actions')
  for (const item of actions) {
    if (!(item instanceof HTMLElement)) continue
    run(item)
  }
}

export const createTaskActionsMenuController = ({ tasksList } = {}) => {
  let activeActions = null

  const open = (actions) => {
    const elements = getActionsElements(actions)
    if (!elements) return
    elements.menuController.open()
    activeActions = actions
  }

  const close = (actions, { focusToggle = false } = {}) => {
    const elements = getActionsElements(actions)
    if (!elements) return
    elements.menuController.close({ focusTrigger: focusToggle })
    if (activeActions === actions) activeActions = null
  }

  const closeAll = () => {
    if (!(tasksList instanceof HTMLElement)) return
    forEachActions(tasksList, (actions) => close(actions))
    activeActions = null
  }

  const disposeAction = (actions) => {
    const elements = getActionsElements(actions)
    elements?.menuController?.dispose?.()
    actionsElementsCache.delete(actions)
  }

  const bind = () => {
    if (!(tasksList instanceof HTMLElement)) return () => {}
    const observer = new MutationObserver(() => {
      if (activeActions instanceof HTMLElement && !activeActions.isConnected) {
        disposeAction(activeActions)
        activeActions = null
      }
    })
    observer.observe(tasksList, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (activeActions instanceof HTMLElement) {
        disposeAction(activeActions)
        activeActions = null
      }
      forEachActions(tasksList, (actions) => disposeAction(actions))
    }
  }

  const onEscape = () => {
    if (!(tasksList instanceof HTMLElement)) return false
    const openedActions = tasksList.querySelector(
      '.task-item-actions [data-task-more-toggle][aria-expanded="true"]',
    )?.closest('.task-item-actions')
    if (!(openedActions instanceof HTMLElement)) {
      closeAll()
      return false
    }
    close(openedActions, { focusToggle: true })
    return true
  }

  const isClickInsideMenu = (target) =>
    target instanceof Element && Boolean(target.closest('.task-more-menu'))

  const isClickInsideList = (target) =>
    target instanceof Node && tasksList instanceof HTMLElement && tasksList.contains(target)

  return {
    bind,
    open,
    close,
    closeAll,
    onEscape,
    isClickInsideMenu,
    isClickInsideList,
  }
}
