import type { Provider, ProviderKind, ProviderRequest } from './types.js'

type AnyProvider = Provider<ProviderRequest>

const providers = new Map<ProviderKind, AnyProvider>()

export const registerProvider = <TRequest extends ProviderRequest>(
  provider: Provider<TRequest>,
): void => {
  providers.set(provider.id, provider as AnyProvider)
}

export const getProvider = <TKind extends ProviderKind>(
  kind: TKind,
): Provider<Extract<ProviderRequest, { provider: TKind }>> => {
  const provider = providers.get(kind)
  if (!provider) throw new Error(`[provider] unregistered provider: ${kind}`)

  return provider as unknown as Provider<
    Extract<ProviderRequest, { provider: TKind }>
  >
}

export const listProviderKinds = (): ProviderKind[] =>
  Array.from(providers.keys())
