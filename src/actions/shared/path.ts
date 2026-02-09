import { isAbsolute, normalize, resolve } from 'node:path'

export const resolvePath = (workDir: string, inputPath: string): string => {
  const normalizedInput = normalize(inputPath)
  if (isAbsolute(normalizedInput)) return normalizedInput
  return resolve(workDir, normalizedInput)
}
