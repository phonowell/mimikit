export {
  applyTelegramEnvOverrides,
  assertEnabledTelegramConfig,
  telegramConfigSchema,
  type TelegramConfig,
} from './config.js'
export { startTelegramPolling, stopTelegramPolling } from './polling.js'
export {
  dispatchTelegramPassiveReply,
  hasTelegramUserInput,
} from './passive-reply.js'
