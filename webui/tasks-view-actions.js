export const createTaskActions = ({ titleText, taskId, isCancelable }) => {
  const actions = document.createElement('div')
  actions.className = 'task-item-actions'

  const moreBtn = document.createElement('button')
  moreBtn.type = 'button'
  moreBtn.className = 'btn btn--icon btn--icon-muted task-more'
  moreBtn.textContent = '⋯'
  moreBtn.setAttribute('aria-label', `More actions for ${titleText}`)
  moreBtn.setAttribute('title', `More actions for ${titleText}`)
  moreBtn.setAttribute('aria-haspopup', 'true')
  moreBtn.setAttribute('aria-expanded', 'false')

  const menu = document.createElement('div')
  menu.className = 'task-menu'
  menu.hidden = true
  menu.setAttribute('aria-hidden', 'true')

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'task-menu-item task-cancel'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.setAttribute('data-task-id', taskId)
  cancelBtn.setAttribute('title', `Cancel ${titleText}`)
  cancelBtn.setAttribute('aria-label', `Cancel ${titleText}`)
  if (!isCancelable || taskId.length === 0) cancelBtn.disabled = true

  menu.appendChild(cancelBtn)
  actions.appendChild(moreBtn)
  actions.appendChild(menu)
  return actions
}
