import { codexSdkProvider } from './codex-sdk-provider.js';
import { openAiResponsesProvider } from './openai-responses-provider.js';
import { opencodeSdkProvider } from './opencode-sdk-provider.js';
const providers = new Map();
const registerProvider = (provider) => {
    providers.set(provider.id, provider);
};
const getProvider = (kind) => {
    const provider = providers.get(kind);
    if (!provider)
        throw new Error(`[provider] unregistered provider: ${kind}`);
    return provider;
};
let registered = false;
const ensureDefaultProvidersRegistered = () => {
    if (registered)
        return;
    registerProvider(codexSdkProvider);
    registerProvider(opencodeSdkProvider);
    registerProvider(openAiResponsesProvider);
    registered = true;
};
export const runWithProvider = (request) => {
    ensureDefaultProvidersRegistered();
    return getProvider(request.provider).run(request);
};
