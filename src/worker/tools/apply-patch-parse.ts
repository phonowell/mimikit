type AddFileHunk = {
  kind: 'add'
  path: string
  contents: string
}

type DeleteFileHunk = {
  kind: 'delete'
  path: string
}

type UpdateFileChunk = {
  changeContext?: string
  oldLines: string[]
  newLines: string[]
  isEndOfFile: boolean
}

type UpdateFileHunk = {
  kind: 'update'
  path: string
  movePath?: string
  chunks: UpdateFileChunk[]
}

export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk

type ParsedPatch = {
  hunks: Hunk[]
}

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const EOF_MARKER = '*** End of File'
const CHANGE_CONTEXT_MARKER = '@@ '
const EMPTY_CHANGE_CONTEXT_MARKER = '@@'

export const normalizePatchPath = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, '/')
  if (!normalized) throw new Error('invalid_patch_path')
  if (normalized.startsWith('/')) throw new Error('invalid_patch_path:absolute')
  if (normalized.includes('..')) throw new Error('invalid_patch_path:parent')
  return normalized
}

export const parsePatchText = (input: string): ParsedPatch => {
  const lines = input.split(/\r?\n/)
  let index = 0
  while (index < lines.length && lines[index]?.trim() === '') index += 1
  if (lines[index] !== BEGIN_PATCH_MARKER)
    throw new Error('patch_missing_begin_marker')
  index += 1
  const hunks: Hunk[] = []

  const parseUpdateChunks = (): UpdateFileChunk[] => {
    const chunks: UpdateFileChunk[] = []
    let current: UpdateFileChunk | null = null
    while (index < lines.length) {
      const line = lines[index] ?? ''
      if (
        line.startsWith(ADD_FILE_MARKER) ||
        line.startsWith(DELETE_FILE_MARKER) ||
        line.startsWith(UPDATE_FILE_MARKER) ||
        line === END_PATCH_MARKER
      )
        break
      if (line === EOF_MARKER) {
        if (!current) throw new Error('patch_invalid_eof_without_chunk')
        current.isEndOfFile = true
        index += 1
        continue
      }
      if (
        line === EMPTY_CHANGE_CONTEXT_MARKER ||
        line.startsWith(CHANGE_CONTEXT_MARKER)
      ) {
        current = {
          ...(line === EMPTY_CHANGE_CONTEXT_MARKER
            ? {}
            : { changeContext: line.slice(3) }),
          oldLines: [],
          newLines: [],
          isEndOfFile: false,
        }
        chunks.push(current)
        index += 1
        continue
      }
      if (!current) throw new Error('patch_invalid_chunk_body_without_context')
      const marker = line[0] ?? ''
      const payload = line.slice(1)
      if (marker === '-') current.oldLines.push(payload)
      else if (marker === '+') current.newLines.push(payload)
      else if (marker === ' ') {
        current.oldLines.push(payload)
        current.newLines.push(payload)
      } else throw new Error(`patch_invalid_chunk_line:${line}`)
      index += 1
    }
    return chunks
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line === END_PATCH_MARKER) return { hunks }
    if (line.startsWith(ADD_FILE_MARKER)) {
      const path = normalizePatchPath(line.slice(ADD_FILE_MARKER.length))
      index += 1
      const contents: string[] = []
      while (index < lines.length) {
        const next = lines[index] ?? ''
        if (
          next.startsWith(ADD_FILE_MARKER) ||
          next.startsWith(DELETE_FILE_MARKER) ||
          next.startsWith(UPDATE_FILE_MARKER) ||
          next === END_PATCH_MARKER
        )
          break
        if (!next.startsWith('+'))
          throw new Error(`patch_add_requires_plus:${next}`)
        contents.push(next.slice(1))
        index += 1
      }
      hunks.push({ kind: 'add', path, contents: contents.join('\n') })
      continue
    }
    if (line.startsWith(DELETE_FILE_MARKER)) {
      const path = normalizePatchPath(line.slice(DELETE_FILE_MARKER.length))
      hunks.push({ kind: 'delete', path })
      index += 1
      continue
    }
    if (line.startsWith(UPDATE_FILE_MARKER)) {
      const path = normalizePatchPath(line.slice(UPDATE_FILE_MARKER.length))
      index += 1
      let movePath: string | undefined
      if ((lines[index] ?? '').startsWith(MOVE_TO_MARKER)) {
        movePath = normalizePatchPath(
          (lines[index] ?? '').slice(MOVE_TO_MARKER.length),
        )
        index += 1
      }
      const chunks = parseUpdateChunks()
      hunks.push({
        kind: 'update',
        path,
        ...(movePath ? { movePath } : {}),
        chunks,
      })
      continue
    }
    throw new Error(`patch_unexpected_line:${line}`)
  }
  throw new Error('patch_missing_end_marker')
}
