import { useEffect, useRef } from 'react'

import type { PropsWithChildren, ReactNode } from 'react'

type Props = PropsWithChildren<{
  open: boolean
  className: string
  id: string
  labelledBy: string
  describedBy?: string
  title: ReactNode
  onClose: () => void
}>

export const ModalDialog = ({
  children,
  open,
  className,
  id,
  labelledBy,
  describedBy,
  title,
  onClose,
}: Props) => {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      return
    }
    if (dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose()
    }
    const handleClose = () => {
      if (open) onClose()
    }
    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('click', handleClick)
    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('click', handleClick)
      dialog.removeEventListener('close', handleClose)
    }
  }, [onClose, open])

  return (
    <dialog
      ref={ref}
      className={className}
      id={id}
      aria-labelledby={labelledBy}
      {...(describedBy ? { 'aria-describedby': describedBy } : {})}
    >
      {title}
      {children}
    </dialog>
  )
}
