export const hasContiguousIndices = (indices: number[]): boolean => {
  if (indices.length === 0) return true
  const ordered = [...new Set(indices)].sort((left, right) => left - right)
  return ordered.every((index, offset) => index === offset + 1)
}
