import { codexSdkProvider } from './codex-sdk-provider.js'
import { openAiChatProvider } from './openai-chat-provider.js'
import { opencodeProvider } from './opencode-provider.js'

import type {
  Provider,
  ProviderKind,
  ProviderRequest,
  ProviderResult,
} from './types.js'

type AnyProvider = Provider<ProviderRequest>

const providers = new Map<ProviderKind, AnyProvider>()

const registerProvider = <TRequest extends ProviderRequest>(
  provider: Provider<TRequest>,
): void => {
  providers.set(provider.id, provider as AnyProvider)
}

const getProvider = <TKind extends ProviderKind>(
  kind: TKind,
): Provider<Extract<ProviderRequest, { provider: TKind }>> => {
  const provider = providers.get(kind)
  if (!provider) throw new Error(`[provider] unregistered provider: ${kind}`)

  return provider as unknown as Provider<
    Extract<ProviderRequest, { provider: TKind }>
  >
}

let registered = false

const ensureDefaultProvidersRegistered = (): void => {
  if (registered) return
  registerProvider(openAiChatProvider)
  registerProvider(codexSdkProvider)
  registerProvider(opencodeProvider)
  registered = true
}

export const runWithProvider = (
  request: ProviderRequest,
): Promise<ProviderResult> => {
  ensureDefaultProvidersRegistered()
  return getProvider(request.provider).run(request)
}
