const createMenuButton = ({
  action,
  text,
  titleText,
  taskId,
  disabled,
}) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `task-menu-item task-menu-item--${action}`
  button.textContent = text
  button.setAttribute('role', 'menuitem')
  button.setAttribute('data-task-action-inline', action)
  button.setAttribute('data-task-id', taskId)
  button.setAttribute('title', `${text} ${titleText}`)
  button.setAttribute('aria-label', `${text} ${titleText}`)
  if (disabled) button.disabled = true
  return button
}

export const createTaskActions = ({ titleText, taskId, statusValue }) => {
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

  const hasTaskId = taskId.length > 0
  const isPending = statusValue === 'pending'
  const isRunning = statusValue === 'running'
  const isPaused = statusValue === 'paused'
  const canPause = hasTaskId && (isPending || isRunning)
  const canResume = hasTaskId && isPaused
  const canCancel = hasTaskId && (isPending || isRunning || isPaused)
  const canDelete = hasTaskId && !isPending && !isRunning && !isPaused
  const primaryAction = isPaused ? 'resume' : 'pause'
  const primaryBtn = createMenuButton({
    action: primaryAction,
    text: primaryAction,
    titleText,
    taskId,
    disabled: !(isPaused ? canResume : canPause),
  })
  const cancelBtn = createMenuButton({
    action: 'cancel',
    text: 'cancel',
    titleText,
    taskId,
    disabled: !canCancel,
  })
  const deleteBtn = createMenuButton({
    action: 'delete',
    text: 'delete',
    titleText,
    taskId,
    disabled: !canDelete,
  })

  menu.appendChild(primaryBtn)
  menu.appendChild(cancelBtn)
  menu.appendChild(deleteBtn)
  actions.appendChild(moreBtn)
  actions.appendChild(menu)
  return actions
}
