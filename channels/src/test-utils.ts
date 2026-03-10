import type { AppConfig } from './types.js'

const DEFAULT_CONFIG = {
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
    chatId: '',
  },
} as const

export const defaultConfig = (params: { workDir: string }): AppConfig => ({
  workDir: params.workDir,
  telegram: { ...DEFAULT_CONFIG.telegram },
  feishu: { ...DEFAULT_CONFIG.feishu },
})

export const buildPaths = (workDir: string): { log: string } => ({
  log: `${workDir}/log.jsonl`,
})

