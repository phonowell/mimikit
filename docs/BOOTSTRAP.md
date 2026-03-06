# Mimikit Bootstrap for LLM

This file is optimized for LLM agents that need to install, configure, and run Mimikit with minimal context.

## Goal

Bring up a local Mimikit runtime and open WebUI at `http://127.0.0.1:8787`.

## Inputs

- Repository root available.
- `node`, `pnpm`, and network access for dependency install.
- One valid API key (`OPENAI_API_KEY`) or an active Codex-compatible provider config.

## Step 1: Install

```bash
pnpm i
```

## Step 2: Configure API Credentials

Fast path:

```bash
export OPENAI_API_KEY=your_key
```

Optional provider path (`~/.codex/config.toml`):

```toml
model_provider = "aicoding"

[model_providers.aicoding]
base_url = "https://your-codex-provider.example.com/v1/codex"
wire_api = "responses"
env_key = "AICODING_API_KEY"
```

API key resolution order in runtime:

1. Active provider `api_key` in `~/.codex/config.toml`
2. Active provider env var (`env_key` / `api_key_env`)
3. `OPENAI_API_KEY`
4. `~/.codex/auth.json` -> `OPENAI_API_KEY`

## Step 3: Start Runtime

Recommended:

```bash
pnpm start
```

Notes:

- `pnpm start` runs `scripts/start.ts` -> installs deps (`pnpm i`) -> launches `bin/mimikit` / `bin/mimikit.ps1`.
- Wrapper supports restart loop on exit code `75` (`/api/restart` / `/api/reset`).
- `config.yaml` is auto-created at repo root from `defaults/config.template.yaml` if missing.
- Unknown keys in `config.yaml` are ignored; CLI startup prints a warning listing ignored keys.

Optional direct start (skip wrapper):

```bash
tsx src/cli/index.ts --port 8787 --work-dir .mimikit
```

## Step 4: Verify

WebUI route responds:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
```

Expected: `200`.

Status API responds:

```bash
curl -sS http://127.0.0.1:8787/api/status
```

Expected: JSON with fields like `runtimeId`.

SSE endpoint emits snapshot:

```bash
curl -sS -N http://127.0.0.1:8787/api/events | head -n 2
```

Expected first line contains `event: snapshot`.

## Optional: Override Models and Reasoning

In `config.yaml`:

```yaml
manager:
  model: gpt-5.2
  modelReasoningEffort: medium
  provider:
    # baseUrl: https://your-codex-provider.example.com/v1/codex
    # apiKey: ${AICODING_API_KEY}
    # proxy: http://127.0.0.1:7897
worker:
  model: gpt-5.3-codex
  modelReasoningEffort: high
  # proxy: http://127.0.0.1:7897
webui:
  enabled: true
```

Env overrides:

```bash
export MIMIKIT_MODEL=gpt-5.2
export MIMIKIT_MANAGER_MODEL=gpt-5.2
export MIMIKIT_WORKER_MODEL=gpt-5.3-codex
export MIMIKIT_REASONING_EFFORT=high
export MIMIKIT_MANAGER_REASONING_EFFORT=medium
export MIMIKIT_WORKER_REASONING_EFFORT=high
export MIMIKIT_PROXY=http://127.0.0.1:7897
export MIMIKIT_MANAGER_PROXY=http://127.0.0.1:7897
export MIMIKIT_WORKER_PROXY=http://127.0.0.1:7897
export MIMIKIT_WEBUI_ENABLED=true
```

Precedence: role-specific env (`MIMIKIT_MANAGER_*` / `MIMIKIT_WORKER_*`) overrides global env.

## Telegram + Proxy Bring-up Record (2026-03-06)

Use this sequence when local network needs a proxy to reach Telegram:

1. Configure `config.yaml`:

```yaml
telegram:
  enabled: true
  botToken: "<your_bot_token>"
  chatId: "<your_chat_id>"
  apiRoot: https://api.telegram.org
  proxy: "http://127.0.0.1:7897"
```

2. Validate bot credentials through proxy:

```bash
HTTPS_PROXY=http://127.0.0.1:7897 \
HTTP_PROXY=http://127.0.0.1:7897 \
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

3. Get `chat_id`:

```bash
HTTPS_PROXY=http://127.0.0.1:7897 \
HTTP_PROXY=http://127.0.0.1:7897 \
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" \
  | jq -r '.result | last | (.message.chat.id // .channel_post.chat.id // .my_chat_member.chat.id)'
```

4. Start runtime and verify by sending a Telegram message to the bot (inbound appears in WebUI and manager reply is sent back to Telegram).
   (`webui.enabled=true` and `telegram.enabled=true` are supported together.)

## Failure Triage

- `OPENAI_API_KEY is missing`: missing credentials and provider requires auth.
- `[cli] instance lock exists at .../.mimikit/.instance`: another process is running on same `--work-dir`.
- `[cli] port 8787 is in use, fallback to ...`: CLI auto-selects first free port in `[8787, 8807]`.
- `[config] invalid yaml defaults`: fix invalid fields in repo-root `config.yaml`.

## Done Criteria

- Runtime keeps running (no immediate startup crash).
- `GET /` returns `200`.
- `GET /api/status` returns JSON.
- `GET /api/events` emits `event: snapshot`.
