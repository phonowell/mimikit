const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

export const decodeUtf8Text = (raw: Buffer): string => utf8Decoder.decode(raw)

const collectLineStarts = (text: string): number[] => {
  if (!text) return []
  const starts = [0]
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10 && index + 1 < text.length)
      starts.push(index + 1)
  }
  return starts
}

export const sliceTextByLines = (params: {
  text: string
  fromLine: number
  maxLines: number
}): {
  content: string
  lineCount: number
  totalLines: number
  truncated: boolean
} => {
  const lineStarts = collectLineStarts(params.text)
  const totalLines = lineStarts.length
  if (totalLines === 0 || params.fromLine > totalLines) {
    return {
      content: '',
      lineCount: 0,
      totalLines,
      truncated: false,
    }
  }
  const startLineIndex = params.fromLine - 1
  const endLineExclusiveIndex = Math.min(
    totalLines,
    startLineIndex + params.maxLines,
  )
  const startOffset = lineStarts[startLineIndex] ?? params.text.length
  const endOffset =
    endLineExclusiveIndex >= totalLines
      ? params.text.length
      : (lineStarts[endLineExclusiveIndex] ?? params.text.length)

  return {
    content: params.text.slice(startOffset, endOffset),
    lineCount: endLineExclusiveIndex - startLineIndex,
    totalLines,
    truncated: endLineExclusiveIndex < totalLines,
  }
}
