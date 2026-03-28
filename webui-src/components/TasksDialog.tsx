import { UI_TEXT } from '../lib/system-text.js'

import { CopyFeedbackNotice } from './CopyFeedbackNotice.js'
import { ModalDialog } from './ModalDialog.js'
import { TaskListItem } from './TaskListItem.js'

import type { CopyFeedbackState, TaskView } from '../types.js'

const isOpenTask = (task: TaskView): boolean =>
  task.status === 'running' ||
  task.status === 'paused' ||
  task.status === 'pending'

type Props = {
  copyFeedback: CopyFeedbackState | null
  open: boolean
  openMenuId: string
  onClearCopyFeedback: () => void
  onClose: () => void
  onToggleMenu: (taskId: string) => void
  onTaskAction: (
    taskId: string,
    action: 'cancel' | 'pause' | 'resume' | 'copy-id',
  ) => void
  onRequestDelete: (taskId: string, title: string) => void
  tasks: TaskView[]
}

export const TasksDialog = ({
  copyFeedback,
  open,
  openMenuId,
  onClearCopyFeedback,
  onClose,
  onToggleMenu,
  onTaskAction,
  onRequestDelete,
  tasks,
}: Props) => {
  const openTasks = tasks.filter(isOpenTask)
  const closedTasks = tasks.filter((task) => !isOpenTask(task))
  const shouldExpandClosed = openTasks.length === 0

  return (
    <ModalDialog
      open={open}
      className="tasks-dialog"
      id="tasks-dialog"
      labelledBy="tasks-title"
      onClose={onClose}
    >
      <section className="tasks-panel">
        <header className="tasks-header">
          <h2 className="tasks-title" id="tasks-title">
            Tasks
          </h2>
          <div className="tasks-actions" role="group" aria-label="Tasks">
            <button
              className="btn btn--icon btn--icon-muted tasks-close"
              type="button"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>
        <CopyFeedbackNotice
          feedback={copyFeedback}
          label="Task copy feedback"
          onClear={onClearCopyFeedback}
        />
        <div className="tasks-list scrollable">
          {tasks.length === 0 ? (
            <div className="list-empty tasks-empty">{UI_TEXT.noTasks}</div>
          ) : null}
          {openTasks.length > 0 ? (
            <section className="tasks-group" data-task-group="open">
              <h3 className="tasks-group-title">
                {UI_TEXT.openTasksLabel} {openTasks.length}
              </h3>
              <ul className="tasks-group-list">
                {openTasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    open={open}
                    task={task}
                    openMenuId={openMenuId}
                    onRequestDelete={onRequestDelete}
                    onTaskAction={onTaskAction}
                    onToggleMenu={onToggleMenu}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {closedTasks.length > 0 ? (
            <details
              className="tasks-group tasks-group--closed"
              data-task-group="closed"
              open={shouldExpandClosed}
            >
              <summary className="tasks-group-summary">
                {UI_TEXT.closedTasksLabel} {closedTasks.length}
              </summary>
              <ul className="tasks-group-list">
                {closedTasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    open={open}
                    task={task}
                    openMenuId={openMenuId}
                    onRequestDelete={onRequestDelete}
                    onTaskAction={onTaskAction}
                    onToggleMenu={onToggleMenu}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>
    </ModalDialog>
  )
}
