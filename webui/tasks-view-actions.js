import { createIconElement } from './icon.js'

const createMenuButton = ({
  action,
  text,
  titleText,
  taskId,
  disabled,
  iconName,
}) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `task-menu-item task-menu-item--${action}`
  button.appendChild(createIconElement(iconName))
  button.append(text)
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
  moreBtn.appendChild(createIconElement('ellipsis'))
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
  const primaryAction = isPaused ? 'resume' : 'pause'
  const primaryBtn = createMenuButton({
    action: primaryAction,
    text: primaryAction,
    titleText,
    taskId,
    disabled: !(isPaused ? canResume : canPause),
    iconName: isPaused ? 'corner-up-right' : 'corner-up-left',
  })
  const cancelBtn = createMenuButton({
    action: 'cancel',
    text: 'cancel',
    titleText,
    taskId,
    disabled: !canCancel,
    iconName: 'x',
  })

  menu.appendChild(primaryBtn)
  menu.appendChild(cancelBtn)
  actions.appendChild(moreBtn)
  actions.appendChild(menu)
  return actions
}
