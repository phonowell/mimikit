import { homedir } from 'node:os';
import { join } from 'node:path';
import TOML from '@iarna/toml';
import { readJson, readTextFileIfExists } from './fs.js';
import { safe } from './safe.js';
import { stripUndefined } from './utils.js';
export const DEFAULT_MODEL_REASONING_EFFORT = 'high';
const readNonEmptyString = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
};
const readBooleanFlag = (value) => {
    if (typeof value === 'boolean')
        return value;
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim();
    if (!normalized)
        return undefined;
    if (/^(1|true|yes|on)$/i.test(normalized))
        return true;
    if (/^(0|false|no|off)$/i.test(normalized))
        return false;
    return undefined;
};
const envString = (key) => readNonEmptyString(process.env[key]);
const envBoolean = (key) => readBooleanFlag(envString(key));
const resolveHomeDir = () => envString('HOME') ?? envString('USERPROFILE') ?? homedir();
const codexAuthPath = () => join(resolveHomeDir(), '.codex', 'auth.json');
const codexConfigPath = () => join(resolveHomeDir(), '.codex', 'config.toml');
const valueRecord = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    return value;
};
const readCodexConfig = async () => {
    const path = codexConfigPath();
    const text = await safe('readCodexConfig: readFile', () => readTextFileIfExists(path), { fallback: '', meta: { path } });
    if (!text.trim())
        return {};
    const parsed = await safe('readCodexConfig: parseToml', () => TOML.parse(text), { meta: { path } });
    return valueRecord(parsed) ?? {};
};
const resolveProviderSettings = (config) => {
    const model = readNonEmptyString(config.model);
    const providerName = readNonEmptyString(config.model_provider);
    const providerMap = valueRecord(config.model_providers);
    const providerConfig = providerName && providerMap
        ? valueRecord(providerMap[providerName])
        : undefined;
    const baseUrl = readNonEmptyString(providerConfig?.base_url);
    const wireApi = readNonEmptyString(providerConfig?.wire_api);
    const apiKey = readNonEmptyString(providerConfig?.api_key);
    const apiKeyEnv = readNonEmptyString(providerConfig?.env_key) ??
        readNonEmptyString(providerConfig?.api_key_env);
    const requiresAuth = readBooleanFlag(providerConfig?.requires_openai_auth);
    return stripUndefined({
        model,
        baseUrl,
        wireApi,
        apiKey,
        apiKeyEnv,
        requiresAuth,
    });
};
const readAuthApiKey = async () => {
    const auth = await readJson(codexAuthPath(), {});
    return readNonEmptyString(auth.OPENAI_API_KEY);
};
export const loadCodexSettings = async () => {
    const config = await readCodexConfig();
    const cs = resolveProviderSettings(config);
    const apiKeyFromProviderEnv = cs.apiKeyEnv !== undefined ? envString(cs.apiKeyEnv) : undefined;
    const apiKey = cs.apiKey ??
        apiKeyFromProviderEnv ??
        envString('OPENAI_API_KEY') ??
        (await readAuthApiKey());
    return stripUndefined({
        apiKey,
        model: envString('OPENAI_MODEL') ?? cs.model,
        baseUrl: envString('OPENAI_BASE_URL') ?? cs.baseUrl,
        wireApi: envString('OPENAI_WIRE_API') ?? cs.wireApi,
        requiresAuth: envBoolean('OPENAI_REQUIRES_AUTH') ?? cs.requiresAuth,
    });
};
