import { applyPatchHunks } from './apply-patch-exec.js'
import { parsePatchText } from './apply-patch-parse.js'
import {
  asString,
  parseToolArgs,
  type ToolCallResult,
  type WorkerToolContext,
} from './common.js'

type ApplyPatchArgs = {
  input?: string
  patch?: string
  content?: string
}

export const runApplyPatchTool = async (
  context: WorkerToolContext,
  args: unknown,
): Promise<ToolCallResult> => {
  try {
    const parsed = parseToolArgs(args) as ApplyPatchArgs
    const input = asString(
      parsed.input ?? parsed.patch ?? parsed.content,
      'input',
    )
    const { hunks } = parsePatchText(input)
    if (hunks.length === 0) throw new Error('patch_empty')
    const { added, modified, deleted } = await applyPatchHunks(context, hunks)
    return {
      ok: true,
      output: `apply_patch ok\nadded: ${added.length}\nmodified: ${modified.length}\ndeleted: ${deleted.length}`,
      details: { added, modified, deleted },
    }
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
