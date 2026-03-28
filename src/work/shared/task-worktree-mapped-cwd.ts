import { stat } from 'node:fs/promises'

export type MappedWorktreeCwdValidationResult =
  | { ok: true }
  | { ok: false; detail: string }

const buildMappedCwdMissingDetail = (params: {
  originalCwd: string
  nestedPath: string
  mappedCwd: string
  reason: 'missing' | 'not_directory' | 'inaccessible'
}): string => {
  const base = `原始 cwd="${params.originalCwd}" 在 worktree 中对应子路径 "${params.nestedPath}"，但映射后的 cwd="${params.mappedCwd}"`
  if (params.reason === 'missing') return `${base} 不存在。`
  if (params.reason === 'not_directory') return `${base} 不是目录。`
  return `${base} 当前不可访问。`
}

export const validateMappedWorktreeCwd = async (params: {
  originalCwd: string
  nestedPath: string
  mappedCwd: string
}): Promise<MappedWorktreeCwdValidationResult> => {
  try {
    const mappedStat = await stat(params.mappedCwd)
    if (mappedStat.isDirectory()) return { ok: true }
    return {
      ok: false,
      detail: buildMappedCwdMissingDetail({
        ...params,
        reason: 'not_directory',
      }),
    }
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    return {
      ok: false,
      detail: buildMappedCwdMissingDetail({
        ...params,
        reason: code === 'ENOENT' ? 'missing' : 'inaccessible',
      }),
    }
  }
}
