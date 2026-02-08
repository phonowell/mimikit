import { runApplyPatchTool } from './apply-patch-tool.js'
import { runBrowserTool } from './browser-tool.js'
import { runEditTool } from './edit-tool.js'
import { runExecTool } from './exec-tool.js'
import { runReadTool } from './read-tool.js'
import { runWriteTool } from './write-tool.js'

import type { ToolCallResult, WorkerToolContext } from './common.js'

export type WorkerToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'apply_patch'
  | 'exec'
  | 'browser'

type ToolRunner = (
  context: WorkerToolContext,
  args: unknown,
) => Promise<ToolCallResult>

const TOOL_RUNNERS: Record<WorkerToolName, ToolRunner> = {
  read: runReadTool,
  write: runWriteTool,
  edit: runEditTool,
  apply_patch: runApplyPatchTool,
  exec: runExecTool,
  browser: runBrowserTool,
}

export const listWorkerTools = (): WorkerToolName[] =>
  Object.keys(TOOL_RUNNERS) as WorkerToolName[]

export const runWorkerTool = (
  context: WorkerToolContext,
  name: string,
  args: unknown,
): Promise<ToolCallResult> => {
  const runner = TOOL_RUNNERS[name as WorkerToolName] as ToolRunner | undefined
  if (!runner) {
    return Promise.resolve({
      ok: false,
      output: '',
      error: `unknown_tool:${name}`,
    })
  }
  return runner(context, args)
}
