# Mimikit Bootstrap for LLM

This file is optimized for LLM agents that need to install, configure, and run Mimikit with minimal context.

## Goal

Bring up a local Mimikit runtime and open WebUI at `http://127.0.0.1:8787`.

## Inputs

- Repository root available.
- `node`, `pnpm`, and network access for dependency install.
- One valid API key (`OPENAI_API_KEY`) or a configured Codex-compatible provider.

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
base_url = "http://api-ai-coding.bilibili.co/api/v1/codex"
wire_api = "responses"
env_key = "AICODING_API_KEY"
```

API key resolution order in runtime:

1. `api_key` from active provider in `~/.codex/config.toml`
2. env var mapped by provider `env_key` / `api_key_env`
3. `OPENAI_API_KEY`
4. `~/.codex/auth.json` -> `OPENAI_API_KEY`

## Step 3: Start Runtime

```bash
pnpm start
```

If `config.yaml` does not exist, Mimikit auto-creates it from `defaults/config.template.yaml`.

## Step 4: Verify

Health check:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
```

Expected: `200`.

SSE endpoint exists:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/api/events
```

Expected: `200`.

## Optional: Force Manager Wire API

In `config.yaml`:

```yaml
manager:
  mode: auto # auto | chat | responses
```

Env override:

```bash
export MIMIKIT_MANAGER_MODE=responses
```

## Failure Triage

- `401/403`: API key missing or invalid.
- Startup fails on provider: verify `~/.codex/config.toml` active provider `base_url` and `wire_api`.
- Port conflict on `8787`: run `tsx src/cli/index.ts --port <new_port>`.

## Done Criteria

- `pnpm start` stays running without immediate crash.
- `GET /` returns `200`.
- WebUI is reachable.
