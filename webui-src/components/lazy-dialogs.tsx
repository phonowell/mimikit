import { lazy } from 'react'

const loadTasksDialogModule = () => import('./TasksDialog.js')
const loadPlansDialogModule = () => import('./PlansDialog.js')
const loadFocusDialogModule = () => import('./FocusDialog.js')

export const preloadTasksDialog = () => void loadTasksDialogModule()
export const preloadPlansDialog = () => void loadPlansDialogModule()
export const preloadFocusDialog = () => void loadFocusDialogModule()

export const LazyTasksDialog = lazy(async () => {
  const module = await loadTasksDialogModule()
  return { default: module.TasksDialog }
})

export const LazyPlansDialog = lazy(async () => {
  const module = await loadPlansDialogModule()
  return { default: module.PlansDialog }
})

export const LazyFocusDialog = lazy(async () => {
  const module = await loadFocusDialogModule()
  return { default: module.FocusDialog }
})
