import { useEffect, useEffectEvent, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { CSSProperties, RefObject } from 'react'

const TASK_MENU_MARGIN = 12
const TASK_MENU_OFFSET = 6
const TASK_MENU_MIN_WIDTH = 150
const TASK_MENU_MAX_WIDTH = 180
const TASK_MENU_ESTIMATED_HEIGHT = 220

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

type Props = {
  canCancel: boolean
  canDelete: boolean
  canPause: boolean
  canResume: boolean
  menuId: string
  menuOpen: boolean
  onRequestDelete: (taskId: string, title: string) => void
  onTaskAction: (
    taskId: string,
    action: 'cancel' | 'pause' | 'resume' | 'copy-id',
  ) => void
  title: string
  toggleRef: RefObject<HTMLButtonElement | null>
  taskId: string
}

export const TaskActionMenu = ({
  canCancel,
  canDelete,
  canPause,
  canResume,
  menuId,
  menuOpen,
  onRequestDelete,
  onTaskAction,
  title,
  toggleRef,
  taskId,
}: Props) => {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const menuMode =
    menuOpen && portalHost && menuStyle ? 'portal' : 'inline-fallback'
  const updateMenuLayout = useEffectEvent(() => {
    const toggle = toggleRef.current
    if (!toggle || typeof window === 'undefined') return
    const rect = toggle.getBoundingClientRect()
    const width = clamp(
      window.innerWidth - TASK_MENU_MARGIN * 2,
      TASK_MENU_MIN_WIDTH,
      TASK_MENU_MAX_WIDTH,
    )
    const left = clamp(
      rect.right - width,
      TASK_MENU_MARGIN,
      window.innerWidth - width - TASK_MENU_MARGIN,
    )
    const openUpward =
      window.innerHeight - rect.bottom <
        TASK_MENU_ESTIMATED_HEIGHT + TASK_MENU_OFFSET &&
      rect.top > TASK_MENU_ESTIMATED_HEIGHT
    const top = openUpward
      ? Math.max(
          TASK_MENU_MARGIN,
          rect.top - TASK_MENU_ESTIMATED_HEIGHT - TASK_MENU_OFFSET,
        )
      : Math.min(
          rect.bottom + TASK_MENU_OFFSET,
          window.innerHeight - TASK_MENU_MARGIN,
        )
    setMenuStyle({
      left: `${left}px`,
      maxHeight: `calc(100vh - ${TASK_MENU_MARGIN * 2}px)`,
      minWidth: `${TASK_MENU_MIN_WIDTH}px`,
      position: 'fixed',
      right: 'auto',
      top: `${top}px`,
      width: `${width}px`,
      zIndex: 21,
    })
  })

  useLayoutEffect(() => {
    if (!menuOpen || typeof document === 'undefined') {
      setPortalHost(null)
      setMenuStyle(null)
      return
    }
    const toggle = toggleRef.current
    const nextPortalHost = toggle?.closest('dialog')
    if (!(nextPortalHost instanceof HTMLElement)) {
      setPortalHost(null)
      setMenuStyle(null)
      return
    }
    setPortalHost(nextPortalHost)
    updateMenuLayout()
  }, [menuOpen, toggleRef, updateMenuLayout])

  useEffect(() => {
    if (!menuOpen || !portalHost) return
    window.addEventListener('resize', updateMenuLayout)
    window.addEventListener('scroll', updateMenuLayout, true)
    return () => {
      window.removeEventListener('resize', updateMenuLayout)
      window.removeEventListener('scroll', updateMenuLayout, true)
    }
  }, [menuOpen, portalHost, updateMenuLayout])

  if (!menuOpen) return null

  const menu = (
    <div
      aria-labelledby={menuId}
      className="task-more-menu"
      data-task-menu-mode={menuMode}
      id={`${menuId}-menu`}
      role="menu"
      style={menuMode === 'portal' ? (menuStyle ?? undefined) : undefined}
    >
      <button
        className="task-menu-item task-menu-item--copy-id"
        type="button"
        role="menuitem"
        onClick={() => onTaskAction(taskId, 'copy-id')}
      >
        copy id
      </button>
      <button
        className={`task-menu-item task-menu-item--${canResume ? 'resume' : 'pause'}`}
        type="button"
        role="menuitem"
        disabled={!(canPause || canResume)}
        onClick={() => onTaskAction(taskId, canResume ? 'resume' : 'pause')}
      >
        {canResume ? 'resume' : 'pause'}
      </button>
      <button
        className="task-menu-item task-menu-item--cancel"
        type="button"
        role="menuitem"
        disabled={!canCancel}
        onClick={() => onTaskAction(taskId, 'cancel')}
      >
        cancel
      </button>
      <button
        className="task-menu-item task-menu-item--delete"
        type="button"
        role="menuitem"
        disabled={!canDelete}
        onClick={() => onRequestDelete(taskId, title)}
      >
        delete
      </button>
    </div>
  )

  return menuMode === 'portal' && portalHost
    ? createPortal(menu, portalHost)
    : menu
}
