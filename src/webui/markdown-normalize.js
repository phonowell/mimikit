const normalizeOrderedListLine = (line) => {
  const normalizedParen = line.replace(/^(\s{0,3}\d+)\)\s*/, '$1. ')
  return normalizedParen.replace(/^(\s{0,3}\d+)\.(?=[^\s\d])/, '$1. ')
}

export const normalizeMarkdownForRender = (text) => {
  const source = typeof text === 'string' ? text : ''
  if (!source) return ''
  const lines = source.split(/\r?\n/)
  let changed = false
  const normalized = lines.map((line) => {
    const next = normalizeOrderedListLine(line)
    if (next !== line) changed = true
    return next
  })
  return changed ? normalized.join('\n') : source
}
