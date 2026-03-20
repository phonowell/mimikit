import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parseConfigInput } from './config-default/user-config-parse.js'

import type { UserConfigDefaults } from './config-default/user-config-defaults.js'

export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../config.toml', import.meta.url),
)
export const DEFAULT_CONFIG_TEMPLATE_PATH = fileURLToPath(
  new URL('../defaults/config.template.toml', import.meta.url),
)

const readConfigSourceOrTemplate = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== 'ENOENT') throw error
  }
  return readFileSync(DEFAULT_CONFIG_TEMPLATE_PATH, 'utf8')
}

export type { UserConfigDefaults } from './config-default/user-config-defaults.js'

export type LoadDefaultConfigFromTomlOptions = {
  onUnknownKeys?: (keys: readonly string[]) => void
}

export const loadDefaultConfigFromToml = (
  path = DEFAULT_CONFIG_PATH,
  options: LoadDefaultConfigFromTomlOptions = {},
): UserConfigDefaults => {
  const source = readConfigSourceOrTemplate(path)
  const parsed = parseConfigInput(source)
  if (parsed.unknownKeys.length > 0) options.onUnknownKeys?.(parsed.unknownKeys)
  return parsed.config
}
