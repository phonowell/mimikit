const TOOL_ACTIONS = [
  'read',
  'write',
  'edit',
  'apply_patch',
  'exec',
  'browser',
] as const

export type StandardToolAction = (typeof TOOL_ACTIONS)[number]

export type StandardStep = {
  action: 'respond' | 'tool'
  response?: string
  tool?: {
    name: StandardToolAction
    args: Record<string, unknown>
  }
}

const COMMAND_ATTR_RE = /(\w+)\s*=\s*"((?:\\.|[^"\\])*)"/g

const unescapeCommandAttrValue = (value: string): string =>
  value.replace(/\\([\\"nrt])/g, (_match, token: string) => {
    if (token === 'n') return '\n'
    if (token === 'r') return '\r'
    if (token === 't') return '\t'
    return token
  })

const parseCommandAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(COMMAND_ATTR_RE)) {
    const key = match[1]
    const value = unescapeCommandAttrValue(match[2] ?? '')
    if (!key) continue
    attrs[key] = value
  }
  return attrs
}

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('standard_tool_boolean_invalid')
}

const requireAttr = (attrs: Record<string, string>, key: string): string => {
  const value = attrs[key]
  if (value === undefined || value.trim().length === 0)
    throw new Error(`standard_tool_attr_missing:${key}`)
  return value
}

const asToolAction = (action: string): StandardToolAction | undefined =>
  TOOL_ACTIONS.find((item) => item === action)

const buildToolArgs = (
  action: StandardToolAction,
  attrs: Record<string, string>,
): Record<string, unknown> => {
  if (action === 'read') return { path: requireAttr(attrs, 'path') }
  if (action === 'write') {
    return {
      path: requireAttr(attrs, 'path'),
      content: requireAttr(attrs, 'content'),
    }
  }
  if (action === 'edit') {
    const replaceAll = parseBoolean(attrs.replaceAll)
    return {
      path: requireAttr(attrs, 'path'),
      oldText: requireAttr(attrs, 'oldText'),
      newText: requireAttr(attrs, 'newText'),
      ...(replaceAll === undefined ? {} : { replaceAll }),
    }
  }
  if (action === 'apply_patch') return { input: requireAttr(attrs, 'input') }
  if (action === 'exec') return { command: requireAttr(attrs, 'command') }
  return { command: requireAttr(attrs, 'command') }
}

const parseAtStep = (text: string): StandardStep | null => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('@'))
  if (lines.length === 0) return null
  const line = lines[lines.length - 1] ?? ''
  const commandMatch = line.match(/^@([a-zA-Z_][\w-]*)(?:\s+(.+))?$/)
  if (!commandMatch) return null
  const action = (commandMatch[1] ?? '').trim()
  const attrs = parseCommandAttrs(commandMatch[2]?.trim() ?? '')
  if (action === 'respond') {
    const response = (attrs.response ?? '').trim()
    if (!response) throw new Error('standard_response_empty')
    return {
      action: 'respond',
      response,
    }
  }
  const toolName = asToolAction(action)
  if (!toolName) throw new Error(`standard_step_unknown_command:${action}`)
  return {
    action: 'tool',
    tool: {
      name: toolName,
      args: buildToolArgs(toolName, attrs),
    },
  }
}

export const parseStep = (output: string): StandardStep => {
  const raw = output.trim()
  if (!raw) throw new Error('standard_step_empty')
  const direct = parseAtStep(raw)
  if (direct) return direct
  const commandBlockMatch = raw.match(
    /<MIMIKIT:commands\s*>([\s\S]*?)<\/MIMIKIT:commands>/,
  )
  if (commandBlockMatch) {
    const block = parseAtStep(commandBlockMatch[1] ?? '')
    if (block) return block
  }
  throw new Error('standard_step_parse_failed:missing_valid_command')
}
