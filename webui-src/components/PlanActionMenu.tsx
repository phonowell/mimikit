import { FloatingActionMenu } from './FloatingActionMenu.js'

import type { RefObject } from 'react'

type Props = {
  menuId: string
  menuOpen: boolean
  onPlanAction: (planId: string, action: 'copy-id') => void
  planId: string
  toggleRef: RefObject<HTMLButtonElement | null>
}

export const PlanActionMenu = ({
  menuId,
  menuOpen,
  onPlanAction,
  planId,
  toggleRef,
}: Props) => {
  if (!menuOpen) return null

  return (
    <FloatingActionMenu
      className="task-more-menu plan-more-menu"
      menuId={menuId}
      menuOpen={menuOpen}
      toggleRef={toggleRef}
    >
      <button
        className="task-menu-item plan-menu-item plan-menu-item--copy-id"
        type="button"
        role="menuitem"
        onClick={() => onPlanAction(planId, 'copy-id')}
      >
        copy id
      </button>
    </FloatingActionMenu>
  )
}
