import type { ToastState } from '../types.js'

type Props = {
  toast: ToastState | null
}

export const Toast = ({ toast }: Props) => (
  <div
    className="app-toast"
    data-state={toast?.state ?? ''}
    data-toast="true"
    hidden={!toast}
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {toast?.message ?? ''}
  </div>
)
