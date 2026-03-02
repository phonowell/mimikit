import { appendMemoryMarkdown } from '../memory/store.js'

import { appendMemorySchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from './runtime-adapter.js'

export const applyAppendMemoryAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = appendMemorySchema.safeParse(item.attrs)
  if (!parsed.success) return

  await appendMemoryMarkdown(runtime.paths.memoryFile, {
    content: parsed.data.content,
    ...(parsed.data.entry_title ? { entryTitle: parsed.data.entry_title } : {}),
  })
}
