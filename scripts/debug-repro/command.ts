const quote = (value: string) => `"${value.replace(/\"/g, '\\"')}"`

export const resolveStartCmd = (raw: string) => {
  const trimmed = raw.trim()
  if (/^pnpm\s+start:windows\b/i.test(trimmed)) {
    return 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\bin\\mimikit.ps1'
  }
  return raw
}

export const buildCommand = (startCmd: string, args: string[]) => {
  const needsDashDash =
    startCmd.includes('pnpm') && !startCmd.includes(' -- ')
  const joined = args.map(quote).join(' ')
  return needsDashDash ? `${startCmd} -- ${joined}` : `${startCmd} ${joined}`
}
