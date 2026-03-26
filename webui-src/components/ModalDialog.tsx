import { useEffect, useEffectEvent, useRef } from 'react'

import type { PropsWithChildren } from 'react'

type Props = PropsWithChildren<{
  open: boolean
  className: string
  id: string
  labelledBy: string
  describedBy?: string
  onClose: () => void
}>

export const ModalDialog = ({
  children,
  open,
  className,
  id,
  labelledBy,
  describedBy,
  onClose,
}: Props) => {
  const ref = useRef<HTMLDialogElement>(null)
  const handleCancel = useEffectEvent((event: Event) => {
    event.preventDefault()
    onClose()
  })
  const handleClick = useEffectEvent((event: MouseEvent) => {
    const dialog = ref.current
    if (dialog && event.target === dialog) onClose()
  })
  const handleClose = useEffectEvent(() => {
    if (open) onClose()
  })

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
    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('click', handleClick)
    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('click', handleClick)
      dialog.removeEventListener('close', handleClose)
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={className}
      id={id}
      aria-labelledby={labelledBy}
      {...(describedBy ? { 'aria-describedby': describedBy } : {})}
    >
      {children}
    </dialog>
  )
}
