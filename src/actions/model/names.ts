export const FILE_ACTION_NAMES = [
  'read_file',
  'search_files',
  'write_file',
  'edit_file',
  'patch_file',
] as const

export const PROCESS_ACTION_NAMES = ['exec_shell', 'run_browser'] as const

export const TASK_ACTION_NAMES = [
  'create_task',
  'cancel_task',
  'summarize_task_result',
] as const

export const ACTION_NAMES = [
  ...FILE_ACTION_NAMES,
  ...PROCESS_ACTION_NAMES,
  ...TASK_ACTION_NAMES,
] as const

export type ActionName = (typeof ACTION_NAMES)[number]
