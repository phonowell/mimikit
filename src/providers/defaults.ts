import { codexSdkProvider } from './codex-sdk-provider.js'
import { openAiChatProvider } from './openai-chat-provider.js'
import { opencodeProvider } from './opencode-provider.js'
import { registerProvider } from './registry.js'

let registered = false

export const ensureDefaultProvidersRegistered = (): void => {
  if (registered) return
  registerProvider(openAiChatProvider)
  registerProvider(codexSdkProvider)
  registerProvider(opencodeProvider)
  registered = true
}
