export const createTaskActions = ({ titleText, taskId, isCancelable }) => {
  const actions = document.createElement('div')
  actions.className = 'task-item-actions'
  actions.setAttribute('data-task-actions', 'true')

  const moreBtn = document.createElement('button')
  moreBtn.type = 'button'
  moreBtn.className = 'btn btn--icon btn--icon-muted task-more-toggle'
  moreBtn.textContent = '⋯'
  moreBtn.setAttribute('data-task-more-toggle', 'true')
  moreBtn.setAttribute('aria-label', `More actions for ${titleText}`)
  moreBtn.setAttribute('aria-haspopup', 'menu')
  moreBtn.setAttribute('aria-expanded', 'false')
  moreBtn.setAttribute('title', `More actions for ${titleText}`)

  const menu = document.createElement('div')
  menu.className = 'task-more-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true

  const canCancel = isCancelable && taskId.length > 0
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'task-menu-item task-cancel-menu-item'
  cancelBtn.textContent = 'cancel'
  cancelBtn.setAttribute('role', 'menuitem')
  cancelBtn.setAttribute('data-task-cancel-inline', 'true')
  cancelBtn.setAttribute('data-task-id', taskId)
  cancelBtn.setAttribute('title', `Cancel ${titleText}`)
  cancelBtn.setAttribute('aria-label', `Cancel ${titleText}`)
  if (!canCancel) cancelBtn.disabled = true

  menu.appendChild(cancelBtn)
  actions.appendChild(moreBtn)
  actions.appendChild(menu)
  return actions
}
