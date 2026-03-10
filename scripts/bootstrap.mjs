#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = resolve(rootDir, 'config.toml')
const configTemplatePath = resolve(rootDir, 'defaults', 'config.template.toml')

const ensureConfigToml = () => {
  if (existsSync(configPath)) return
  const source = readFileSync(configTemplatePath, 'utf8')
  writeFileSync(configPath, source, { encoding: 'utf8', flag: 'wx' })
  console.log('[bootstrap] created config.toml from defaults/config.template.toml')
}

const main = () => {
  ensureConfigToml()
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[bootstrap] failed: ${message}`)
  process.exit(1)
}
