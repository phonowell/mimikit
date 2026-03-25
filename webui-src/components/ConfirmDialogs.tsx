import { ModalDialog } from './ModalDialog.js'

import type { ConfirmDialogState } from '../types.js'

type Props = {
  dialog: ConfirmDialogState | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}

const resolveCopy = (dialog: ConfirmDialogState | null) => {
  if (!dialog) return null
  if (dialog.kind === 'message') {
    return {
      className: 'message-delete-dialog',
      id: 'message-delete-dialog',
      titleId: 'message-delete-title',
      descriptionId: 'message-delete-description',
      title: 'Delete Message?',
      description:
        'This will replace the original content with a system message.',
      confirmLabel: 'Delete',
      confirmClassName: 'btn btn--md btn--dialog btn--danger',
      sectionClassName: 'message-delete-panel',
      headerClassName: 'message-delete-header',
      titleClassName: 'message-delete-title',
      descriptionClassName: 'message-delete-description',
      actionsClassName: 'message-delete-actions',
    }
  }
  if (dialog.kind === 'task') {
    return {
      className: 'task-delete-dialog',
      id: 'task-delete-dialog',
      titleId: 'task-delete-title',
      descriptionId: 'task-delete-description',
      title: 'Delete Task?',
      description: 'This removes task history and archive files permanently.',
      confirmLabel: 'Delete',
      confirmClassName: 'btn btn--md btn--dialog btn--danger',
      sectionClassName: 'task-delete-panel',
      headerClassName: 'task-delete-header',
      titleClassName: 'task-delete-title',
      descriptionClassName: 'task-delete-description',
      actionsClassName: 'task-delete-actions',
    }
  }
  if (dialog.kind === 'restart') {
    return {
      className: 'restart-dialog',
      id: 'restart-dialog',
      titleId: 'restart-title',
      descriptionId: 'restart-description',
      title: 'Restart Runtime?',
      description: 'Restart keeps current state and reconnects the runtime.',
      confirmLabel: 'Restart',
      confirmClassName: 'btn btn--md btn--dialog btn--primary',
      sectionClassName: 'restart-panel',
      headerClassName: 'restart-header',
      titleClassName: 'restart-title',
      descriptionClassName: 'restart-description',
      actionsClassName: 'restart-actions',
    }
  }
  return {
    className: 'reset-dialog',
    id: 'reset-dialog',
    titleId: 'reset-title',
    descriptionId: 'reset-description',
    title: 'Reset Runtime?',
    description: 'Reset clears the .mimikit state directory before restarting.',
    confirmLabel: 'Reset',
    confirmClassName: 'btn btn--md btn--dialog btn--danger',
    sectionClassName: 'reset-panel',
    headerClassName: 'reset-header',
    titleClassName: 'reset-title',
    descriptionClassName: 'reset-description',
    actionsClassName: 'reset-actions',
  }
}

export const ConfirmDialogs = ({ dialog, busy, onClose, onConfirm }: Props) => {
  const copy = resolveCopy(dialog)
  if (!copy) return null
  return (
    <ModalDialog
      open={dialog !== null}
      className={copy.className}
      id={copy.id}
      labelledBy={copy.titleId}
      describedBy={copy.descriptionId}
      onClose={onClose}
      title={null}
    >
      <section className={copy.sectionClassName}>
        <header className={copy.headerClassName}>
          <h2 className={copy.titleClassName} id={copy.titleId}>
            {copy.title}
          </h2>
        </header>
        <p className={copy.descriptionClassName} id={copy.descriptionId}>
          {copy.description}
        </p>
        <div
          className={copy.actionsClassName}
          role="group"
          aria-label={copy.title}
        >
          <button
            className="btn btn--md btn--dialog"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={copy.confirmClassName}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </section>
    </ModalDialog>
  )
}
