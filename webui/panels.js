import { bindFocusInteractions } from './focus-interactions.js'
import { renderFocuses } from './focus-view.js'
import { bindPlanInteractions } from './plans-interactions.js'
import { renderPlans } from './plans-view.js'
import { bindSnapshotPanel } from './snapshot-panel.js'

const normalizeItemsPayload = (value) => ({
  items: Array.isArray(value?.items) ? value.items : [],
})

const bindItemsPanel = ({ list, dialog, openBtn, closeBtn, render, emptyClass }) => {
  const panel = bindSnapshotPanel({
    list,
    dialog,
    openBtn,
    closeBtn,
    render,
    normalizePayload: normalizeItemsPayload,
    emptyClass,
  })
  return {
    applySnapshot: panel.applySnapshot,
    setDisconnected: panel.setDisconnected,
    dispose: panel.dispose,
  }
}

export const bindPlansPanel = ({
  plansList,
  plansDialog,
  plansOpenBtn,
  plansCloseBtn,
}) => {
  const unbindPlanInteractions = bindPlanInteractions(plansList)
  const panel = bindItemsPanel({
    list: plansList,
    dialog: plansDialog,
    openBtn: plansOpenBtn,
    closeBtn: plansCloseBtn,
    render: renderPlans,
    emptyClass: 'plans-empty',
  })
  return {
    applyPlansSnapshot: panel.applySnapshot,
    setDisconnected: panel.setDisconnected,
    dispose: () => {
      unbindPlanInteractions()
      panel.dispose()
    },
  }
}

export const bindFocusPanel = ({
  focusesList,
  focusesDialog,
  focusesOpenBtn,
  focusesCloseBtn,
}) => {
  const unbindFocusInteractions = bindFocusInteractions(focusesList)
  const panel = bindItemsPanel({
    list: focusesList,
    dialog: focusesDialog,
    openBtn: focusesOpenBtn,
    closeBtn: focusesCloseBtn,
    render: renderFocuses,
    emptyClass: 'focuses-empty',
  })
  return {
    applyFocusesSnapshot: panel.applySnapshot,
    setDisconnected: panel.setDisconnected,
    dispose: () => {
      unbindFocusInteractions()
      panel.dispose()
    },
  }
}
