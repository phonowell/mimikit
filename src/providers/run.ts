import { ensureDefaultProvidersRegistered } from './defaults.js'
import { getProvider } from './registry.js'

import type { ProviderRequest, ProviderResult } from './types.js'

export const runWithProvider = (
  request: ProviderRequest,
): Promise<ProviderResult> => {
  ensureDefaultProvidersRegistered()
  switch (request.provider) {
    case 'openai-chat':
      return getProvider('openai-chat').run(request)
    case 'codex-sdk':
      return getProvider('codex-sdk').run(request)
  }
}
