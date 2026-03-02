export const createTaskActions = ({ titleText, taskId, isCancelable }) => {
  if (!isCancelable || taskId.length === 0) return null

  const actions = document.createElement('div')
  actions.className = 'task-item-actions'

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'btn btn--icon btn--icon-muted task-cancel-inline'
  cancelBtn.textContent = '✕'
  cancelBtn.setAttribute('data-task-cancel-inline', 'true')
  cancelBtn.setAttribute('data-task-id', taskId)
  cancelBtn.setAttribute('title', `Cancel ${titleText}`)
  cancelBtn.setAttribute('aria-label', `Cancel ${titleText}`)

  actions.appendChild(cancelBtn)
  return actions
}
