import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type SpawnTarget = {
  command: string
  args: string[]
  label: string
}

const isWindows = process.platform === 'win32'
const windowsCodexBins = ['codex.cmd', 'codex.exe']
const unixCodexBins = ['codex']

const uniquePush = <T>(list: T[], item: T): void => {
  if (!list.includes(item)) list.push(item)
}

const getCmdPath = (): string =>
  process.env.ComSpec?.trim() ? process.env.ComSpec : 'cmd.exe'

const splitWindowsPath = (value: string): string[] =>
  value
    .split(';')
    .map((item) => item.trim().replace(/^"+|"+$/g, ''))
    .filter(Boolean)

export const resolveCodexTargets = (): SpawnTarget[] => {
  const targets: SpawnTarget[] = []
  const seen = new Set<string>()

  const addTarget = (command: string, args: string[], label: string): void => {
    const key = `${command}\u0000${args.join('\u0000')}`
    if (seen.has(key)) return
    seen.add(key)
    targets.push({ command, args, label })
  }

  const addScriptTarget = (scriptPath: string, label: string): void => {
    if (!isWindows) {
      addTarget(scriptPath, [], label)
      return
    }

    const lower = scriptPath.toLowerCase()
    if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
      addTarget(getCmdPath(), ['/d', '/s', '/c', scriptPath], `${label}:cmd`)
      return
    }

    addTarget(scriptPath, [], label)
  }

  const envPath = process.env.MIMIKIT_CODEX_PATH ?? process.env.CODEX_PATH
  if (envPath?.trim()) addScriptTarget(envPath, 'env:CODEX_PATH')

  if (!isWindows) addTarget('codex', [], 'path:codex')
  else {
    const rawPath = process.env.PATH ?? process.env.Path ?? ''
    if (rawPath) {
      for (const dir of splitWindowsPath(rawPath)) {
        for (const bin of windowsCodexBins) {
          const fullPath = join(dir, bin)
          if (existsSync(fullPath))
            addScriptTarget(fullPath, `path:${fullPath}`)
        }
      }
    }
  }

  const pnpmHomes: string[] = []
  const pnpmHome = process.env.PNPM_HOME
  if (pnpmHome?.trim()) pnpmHomes.push(pnpmHome)
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData?.trim()) uniquePush(pnpmHomes, join(localAppData, 'pnpm'))
  const userProfile = process.env.USERPROFILE
  if (userProfile?.trim())
    uniquePush(pnpmHomes, join(userProfile, 'AppData', 'Local', 'pnpm'))

  const bins = isWindows ? windowsCodexBins : unixCodexBins
  for (const home of pnpmHomes) {
    for (const bin of bins) {
      const fullPath = join(home, bin)
      if (existsSync(fullPath)) addScriptTarget(fullPath, `pnpm:${fullPath}`)
    }
  }

  return targets
}
