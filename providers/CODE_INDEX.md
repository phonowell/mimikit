# Code Index

*Last updated: 2026-03-09 01:41 (Asia/Shanghai)*

## Quick Reference

| Category | Count | Location |
|----------|-------|----------|
| Provider Registry | 3 providers | src/providers/registry.ts |
| Provider Runtime | 4 helpers | src/providers/provider-runtime.ts |
| Provider Error Mapping | 8 helpers/class | src/providers/provider-error.ts |
| Provider Payload Parsing | 2 helpers | src/providers/provider-payload.ts |
| Shared Provider Utils | 4 helpers | src/providers/utils.ts |
| Thread ID Handling | 3 helpers | src/providers/thread-id.ts |

---

## Shared Provider Utils

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `newProviderId()` | src/providers/utils.ts:3 | Generates provider-safe random id | `()` |
| `stripUndefined()` | src/providers/utils.ts:5 | Removes `undefined` keys from object | `<T extends Record<string, unknown>>(obj: T)` |
| `resolveHttpProxyUrl()` | src/providers/utils.ts:15 | Normalizes HTTP(S) proxy URL and delegates invalid handling | `({ proxy, onInvalidUrl, onInvalidProtocol })` |
| `normalizeUsage()` | src/providers/utils.ts:81 | Normalizes token usage payload from multiple provider schemas | `(usage?: unknown)` |

## Proxy Resolution Capability

| Function | Location | Does What | Params |
|----------|----------|-----------|--------|
| `resolveCodexProxy()` | src/providers/codex-sdk-provider.ts:42 | Resolves codex proxy via shared URL normalization | `(proxy: string \| undefined)` |
| `resolveProxyDispatcher()` | src/providers/openai-responses-provider.ts:86 | Resolves/caches undici proxy dispatcher via shared normalization | `(proxy: string \| undefined)` |
| `resolveProxyUrl()` | src/providers/opencode-sdk-provider.ts:105 | Resolves opencode proxy URL via shared normalization | `(proxy: string \| undefined)` |

## Provider Entry Points

| Function | Location | Does What | Returns |
|----------|----------|-----------|---------|
| `codexSdkProvider.run()` | src/providers/codex-sdk-provider.ts:67 | Runs Codex SDK provider flow | `Promise<ProviderResult>` |
| `openAiResponsesProvider.run()` | src/providers/openai-responses-provider.ts:295 | Runs OpenAI Responses API provider flow | `Promise<ProviderResult>` |
| `opencodeSdkProvider.run()` | src/providers/opencode-sdk-provider.ts:696 | Runs OpenCode SDK provider flow | `Promise<ProviderResult>` |
