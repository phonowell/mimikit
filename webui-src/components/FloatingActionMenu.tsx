import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import type { CSSProperties, PropsWithChildren, RefObject } from 'react'

const ACTION_MENU_MARGIN = 12
const ACTION_MENU_OFFSET = 6
const ACTION_MENU_MIN_WIDTH = 150
const ACTION_MENU_MAX_WIDTH = 180
const ACTION_MENU_ESTIMATED_HEIGHT = 220

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

type Props = PropsWithChildren<{
  className: string
  menuId: string
  menuOpen: boolean
  toggleRef: RefObject<HTMLButtonElement | null>
}>

export const FloatingActionMenu = ({
  children,
  className,
  menuId,
  menuOpen,
  toggleRef,
}: Props) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const menuMode =
    menuOpen && portalHost && menuStyle ? 'portal' : 'inline-fallback'
  const updateMenuLayout = useEffectEvent(() => {
    const toggle = toggleRef.current
    if (!toggle || typeof window === 'undefined') return
    const rect = toggle.getBoundingClientRect()
    const menuHeight =
      menuRef.current?.getBoundingClientRect().height ??
      ACTION_MENU_ESTIMATED_HEIGHT
    const width = clamp(
      window.innerWidth - ACTION_MENU_MARGIN * 2,
      ACTION_MENU_MIN_WIDTH,
      ACTION_MENU_MAX_WIDTH,
    )
    const left = clamp(
      rect.right - width,
      ACTION_MENU_MARGIN,
      window.innerWidth - width - ACTION_MENU_MARGIN,
    )
    const openUpward =
      window.innerHeight - rect.bottom < menuHeight + ACTION_MENU_OFFSET &&
      rect.top > menuHeight
    const top = openUpward
      ? Math.max(ACTION_MENU_MARGIN, rect.top - menuHeight - ACTION_MENU_OFFSET)
      : Math.min(
          rect.bottom + ACTION_MENU_OFFSET,
          window.innerHeight - ACTION_MENU_MARGIN,
        )
    setMenuStyle({
      left: `${left}px`,
      maxHeight: `calc(100vh - ${ACTION_MENU_MARGIN * 2}px)`,
      minWidth: `${ACTION_MENU_MIN_WIDTH}px`,
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
  }, [menuOpen, toggleRef])

  useEffect(() => {
    if (!menuOpen || !portalHost) return
    window.addEventListener('resize', updateMenuLayout)
    window.addEventListener('scroll', updateMenuLayout, true)
    return () => {
      window.removeEventListener('resize', updateMenuLayout)
      window.removeEventListener('scroll', updateMenuLayout, true)
    }
  }, [menuOpen, portalHost])

  if (!menuOpen) return null

  const menu = (
    <div
      aria-labelledby={menuId}
      className={className}
      data-action-menu-mode={menuMode}
      id={`${menuId}-menu`}
      ref={menuRef}
      role="menu"
      style={menuMode === 'portal' ? (menuStyle ?? undefined) : undefined}
    >
      {children}
    </div>
  )

  return menuMode === 'portal' && portalHost
    ? createPortal(menu, portalHost)
    : menu
}
