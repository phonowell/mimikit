#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultProvidersPath = resolve(rootDir, '..', 'mimikit-providers')
const providersPath = resolve(
  process.env.MIMIKIT_PROVIDERS_PATH?.trim() || defaultProvidersPath,
)
const providersRepo =
  process.env.MIMIKIT_PROVIDERS_REPO?.trim() ||
  'https://github.com/phonowell/mimikit-providers.git'
const defaultChannelsPath = resolve(rootDir, '..', 'mimikit-channels')
const channelsPath = resolve(
  process.env.MIMIKIT_CHANNELS_PATH?.trim() || defaultChannelsPath,
)
const channelsRepo =
  process.env.MIMIKIT_CHANNELS_REPO?.trim() ||
  'https://github.com/phonowell/mimikit-channels.git'
const configPath = resolve(rootDir, 'config.toml')
const configTemplatePath = resolve(rootDir, 'defaults', 'config.template.toml')

const run = (cmd, args, cwd = rootDir) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (result.error) {
    const message =
      result.error instanceof Error ? result.error.message : String(result.error)
    throw new Error(`${cmd} failed: ${message}`)
  }
  if ((result.status ?? 1) !== 0)
    throw new Error(`${cmd} exited with code ${result.status}`)
}

const ensureProvidersRepo = () => {
  if (!existsSync(providersPath)) {
    console.log(`[bootstrap] cloning providers repo into ${providersPath}`)
    run('git', ['clone', providersRepo, providersPath], rootDir)
    return
  }

  const gitDir = join(providersPath, '.git')
  if (!existsSync(gitDir)) {
    throw new Error(
      `[bootstrap] providers path exists but is not a git repo: ${providersPath}`,
    )
  }
}

const ensureChannelsRepo = () => {
  if (!existsSync(channelsPath)) {
    console.log(`[bootstrap] cloning channels repo into ${channelsPath}`)
    run('git', ['clone', channelsRepo, channelsPath], rootDir)
    return
  }

  const gitDir = join(channelsPath, '.git')
  if (!existsSync(gitDir)) {
    throw new Error(
      `[bootstrap] channels path exists but is not a git repo: ${channelsPath}`,
    )
  }
}

const ensureConfigToml = () => {
  if (existsSync(configPath)) return
  const source = readFileSync(configTemplatePath, 'utf8')
  writeFileSync(configPath, source, { encoding: 'utf8', flag: 'wx' })
  console.log('[bootstrap] created config.toml from defaults/config.template.toml')
}

const installProvidersDependencies = () => {
  console.log('[bootstrap] installing providers dependencies via pnpm')
  run('pnpm', ['install'], providersPath)
}

const installChannelsDependencies = () => {
  console.log('[bootstrap] installing channels dependencies via pnpm')
  run('pnpm', ['install'], channelsPath)
}

const main = () => {
  ensureProvidersRepo()
  ensureChannelsRepo()
  installProvidersDependencies()
  installChannelsDependencies()
  ensureConfigToml()
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[bootstrap] failed: ${message}`)
  process.exit(1)
}
