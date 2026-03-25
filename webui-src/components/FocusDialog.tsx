import { UI_TEXT } from '../lib/system-text.js'

import { FocusListItem } from './FocusListItem.js'
import { ModalDialog } from './ModalDialog.js'

import type { FocusView } from '../types.js'

type Props = {
  open: boolean
  focuses: FocusView[]
  onClose: () => void
}

export const FocusDialog = ({ open, focuses, onClose }: Props) => (
  <ModalDialog
    open={open}
    className="focuses-dialog"
    id="focuses-dialog"
    labelledBy="focuses-title"
    onClose={onClose}
    title={null}
  >
    <section className="focuses-panel">
      <header className="focuses-header">
        <h2 className="focuses-title" id="focuses-title">
          Focus
        </h2>
        <div className="focuses-actions" role="group" aria-label="Focus">
          <button
            className="btn btn--icon btn--icon-muted focuses-close"
            type="button"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>
      <ul className="focuses-list scrollable">
        {focuses.length === 0 ? (
          <li className="list-empty focuses-empty">{UI_TEXT.noFocuses}</li>
        ) : null}
        {focuses.map((focus) => (
          <FocusListItem key={focus.id} focus={focus} open={open} />
        ))}
      </ul>
    </section>
  </ModalDialog>
)
