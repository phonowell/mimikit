const SPACE_RE = /\s/
const NAME_RE = /^[A-Za-z_][\w:-]*$/

const isEscaped = (text, index) => {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && text.charAt(cursor) === '\\'; cursor -= 1)
    slashCount += 1
  return slashCount % 2 === 1
}

const findTagEnd = (text, tagStart) => {
  if (tagStart < 0 || tagStart >= text.length || text.charAt(tagStart) !== '<') return null
  let quote = ''
  for (let cursor = tagStart + 1; cursor < text.length; cursor += 1) {
    const current = text.charAt(cursor)
    if (quote) {
      if (current === quote && !isEscaped(text, cursor)) quote = ''
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      continue
    }
    if (current === '>') return cursor + 1
  }
  return null
}

const extractTagNameFromRaw = (rawOpenTag) => {
  if (!rawOpenTag.startsWith('<')) return null
  let cursor = 1
  const start = cursor
  while (cursor < rawOpenTag.length) {
    const current = rawOpenTag.charAt(cursor)
    if (current === '/' || current === '>' || SPACE_RE.test(current)) break
    cursor += 1
  }
  const fullName = rawOpenTag.slice(start, cursor)
  return NAME_RE.test(fullName) ? fullName : null
}

const parseMetaTagName = (fullName) => {
  const separator = fullName.indexOf(':')
  if (separator <= 0) return null
  if (fullName.slice(0, separator).toLowerCase() !== 'm') return null
  const name = fullName.slice(separator + 1)
  if (!NAME_RE.test(name)) return null
  return name
}

const isSelfClosingTag = (rawOpenTag) => /\/\s*>$/.test(rawOpenTag)

const normalizeRenderedText = (text) =>
  text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd()

const collectProtectedRanges = (source) => {
  const ranges = []
  const lines = source.split(/\r?\n/)
  let offset = 0
  let inFence = false
  let fenceChar = ''
  let fenceLength = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineStart = offset
    const hasNext = index < lines.length - 1
    const lineEnd = lineStart + line.length + (hasNext ? 1 : 0)
    offset = lineEnd

    if (!inFence) {
      const fenceOpenMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (fenceOpenMatch) {
        inFence = true
        fenceChar = fenceOpenMatch[1].charAt(0)
        fenceLength = fenceOpenMatch[1].length
        ranges.push([lineStart, lineEnd])
        continue
      }

      let inlineOpen = null
      for (let cursor = 0; cursor < line.length; cursor += 1) {
        if (line.charAt(cursor) !== '`') continue
        let end = cursor + 1
        while (end < line.length && line.charAt(end) === '`') end += 1
        const tickLength = end - cursor
        if (inlineOpen === null) inlineOpen = { tickLength, start: cursor }
        else if (inlineOpen.tickLength === tickLength) {
          ranges.push([lineStart + inlineOpen.start, lineStart + end])
          inlineOpen = null
        }
        cursor = end - 1
      }
      continue
    }

    ranges.push([lineStart, lineEnd])
    const fenceCloseRe = new RegExp(`^\\s{0,3}${fenceChar}{${fenceLength},}\\s*$`)
    if (fenceCloseRe.test(line)) {
      inFence = false
      fenceChar = ''
      fenceLength = 0
    }
  }

  return ranges
}

const isIndexInRanges = (ranges, index) => {
  for (const [start, end] of ranges) {
    if (index < start) return false
    if (index >= start && index < end) return true
  }
  return false
}

export const extractMetaActions = (text) => {
  const source = typeof text === 'string' ? text : ''
  if (!source || !source.includes('<M:')) return { cleanText: source, actions: [] }

  const protectedRanges = collectProtectedRanges(source)
  const actions = []
  let searchCursor = 0
  let lastCopied = 0
  let renderedText = ''

  for (;;) {
    const openStart = source.indexOf('<M:', searchCursor)
    if (openStart < 0) break
    if (isIndexInRanges(protectedRanges, openStart)) {
      searchCursor = openStart + 3
      continue
    }

    const openEnd = findTagEnd(source, openStart)
    if (!openEnd || openEnd <= openStart) {
      searchCursor = openStart + 3
      continue
    }

    const rawOpenTag = source.slice(openStart, openEnd)
    const fullName = extractTagNameFromRaw(rawOpenTag)
    if (!fullName) {
      searchCursor = openStart + 3
      continue
    }

    const name = parseMetaTagName(fullName)
    if (!name) {
      searchCursor = openStart + 3
      continue
    }

    if (isSelfClosingTag(rawOpenTag)) {
      renderedText += source.slice(lastCopied, openStart)
      actions.push({
        id: `action-${actions.length + 1}`,
        name,
        command: rawOpenTag.trim(),
      })
      lastCopied = openEnd
      searchCursor = openEnd
      continue
    }

    const closeToken = `</${fullName}>`
    const closeStart = source.indexOf(closeToken, openEnd)
    if (closeStart < 0) {
      searchCursor = openEnd
      continue
    }

    const closeEnd = closeStart + closeToken.length
    renderedText += source.slice(lastCopied, openStart)
    actions.push({
      id: `action-${actions.length + 1}`,
      name,
      command: source.slice(openStart, closeEnd).trim(),
    })
    lastCopied = closeEnd
    searchCursor = closeEnd
  }

  if (lastCopied < source.length) renderedText += source.slice(lastCopied)
  return {
    cleanText: normalizeRenderedText(renderedText),
    actions,
  }
}
