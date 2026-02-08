export const quoteShellValue = (value: string): string =>
  `"${value.replaceAll('"', '\\"')}"`

export const prependWorkDir = (
  workDir: string,
  command: string | string[],
): string[] => {
  const list = Array.isArray(command) ? command : [command]
  return [`cd ${quoteShellValue(workDir)}`, ...list]
}
