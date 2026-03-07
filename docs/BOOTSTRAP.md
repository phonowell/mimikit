# Mimikit Bootstrap (Code-Aligned, Low-Noise)

Goal: start Mimikit locally and open WebUI at `http://127.0.0.1:8787`.

## Preconditions

- Run from repo root.
- `node` + `pnpm` installed.
- Network available for dependency install.
- One usable API credential path is configured.

## 1) Install

```bash
pnpm i
```

## 2) Configure credentials

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

Runtime API key resolution order:

1. Active provider `api_key` in `~/.codex/config.toml`
2. Active provider env var from `env_key` / `api_key_env`
3. `OPENAI_API_KEY`
4. `~/.codex/auth.json` -> `OPENAI_API_KEY`

## 3) Start runtime

Recommended:

```bash
pnpm start
```

What this does:

- Runs `scripts/start.ts`.
- Ensures dependencies (`pnpm i`) before launch.
- Starts wrapper: `bin/mimikit` (Unix) or `bin/mimikit.ps1` (Windows).
- Restarts on exit code `75` (`POST /api/restart` and `POST /api/reset` use this).
- Auto-creates repo-root `config.toml` from `defaults/config.template.toml` when missing.
- Unknown keys in `config.toml` are ignored with a startup warning.

Direct start (no wrapper/restart loop):

```bash
tsx src/cli/index.ts --work-dir .mimikit
```

## 4) Verify

WebUI:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
```

Expected: `200`

Runtime status:

```bash
curl -sS http://127.0.0.1:8787/api/status
```

Expected: JSON with fields including:
`ok`, `runtimeId`, `agentStatus`, `activeTasks`, `pendingTasks`, `pendingInputs`, `managerRunning`, `maxWorkers`.

SSE stream:

```bash
curl -sS -N http://127.0.0.1:8787/api/events | head -n 2
```

Expected first event line: `event: snapshot`

## 5) Minimal config and env overrides

`config.toml` keys (minimum useful set):

```toml
[manager]
model = "gpt-5.2"
modelReasoningEffort = "medium"

[worker]
maxConcurrent = 3
timeoutMs = 600000

[codex]
enabled = true
model = "gpt-5.3-codex"
modelReasoningEffort = "high"
capability = "high"
billing = "medium"

[opencode]
enabled = false
model = "big-pickle"
capability = "low"
billing = "free"

[webui]
enabled = true
port = 8787
```

Main env overrides:

```bash
export MIMIKIT_MODEL=gpt-5.2
export MIMIKIT_MANAGER_MODEL=gpt-5.2
export MIMIKIT_CODEX_MODEL=gpt-5.3-codex
export MIMIKIT_OPENCODE_MODEL=big-pickle
export MIMIKIT_REASONING_EFFORT=high
export MIMIKIT_MANAGER_REASONING_EFFORT=medium
export MIMIKIT_CODEX_REASONING_EFFORT=high
export MIMIKIT_PROXY=http://127.0.0.1:7897
export MIMIKIT_MANAGER_PROXY=http://127.0.0.1:7897
export MIMIKIT_CODEX_PROXY=http://127.0.0.1:7897
export MIMIKIT_OPENCODE_PROXY=http://127.0.0.1:7897
export MIMIKIT_CODEX_ENABLED=true
export MIMIKIT_OPENCODE_ENABLED=false
export MIMIKIT_WEBUI_ENABLED=true
export MIMIKIT_WEBUI_PORT=8787
```

Precedence: role-specific env (`MIMIKIT_MANAGER_*`, `MIMIKIT_CODEX_*`, `MIMIKIT_OPENCODE_*`) overrides global env (`MIMIKIT_*`).

## Failure triage

- `OPENAI_API_KEY is missing`: credentials not resolved and provider requires auth.
- `[cli] instance lock exists at .../.mimikit/.instance`: another process already uses the same `--work-dir`.
- `[cli] port 8787 is in use, fallback to ...`: CLI picks first free port in `[8787, 8807]` (target port comes from `--port` > `MIMIKIT_WEBUI_PORT` > `config.toml` `webui.port`).
- `[config] invalid toml defaults`: invalid `config.toml` field values/types.

## Done criteria

- Process stays up after startup.
- `GET /` returns `200`.
- `GET /api/status` returns JSON.
- `GET /api/events` emits `event: snapshot`.
