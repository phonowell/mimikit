# Mimikit

[![TypeScript](https://img.shields.io/badge/TypeScript-ESM%20%2B%20Strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.json)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Runtime](https://img.shields.io/badge/Runtime-Single%20Session-black)](./docs/design/architecture/system-architecture.md)
[![CI](https://github.com/phonowell/mimikit/actions/workflows/ci.yml/badge.svg)](https://github.com/phonowell/mimikit/actions/workflows/ci.yml)

Mimikit 是面向无人在线时段与长时间异步窗口的低成本自治作业系统。它保持单一主 session，用 `manager + worker` 驱动作业闭环，把真正执行委托给外部运行时，并把状态、计划、日志与恢复点持久化到本地。

它不是通用 agent 平台。当前边界只有四件事：异步触发、低成本常驻、失败恢复、人返回后的复盘与续跑。

## Positioning

- 低常驻成本：单 session、单 manager loop、外部执行运行时复用。
- 异步执行与恢复：支持 `cron`、`scheduled_at`、`on_worker_slot_freed`，重启后可继续。
- 显式止损边界：高成本或不确定任务停在确认边界。
- 可复盘观察：WebUI、CLI action log、`.mimikit/` 状态目录共同构成观测面。

## 30 分钟跑起来

### 1) 准备环境

- CI 基线是 Node `22` + `pnpm@10.28.2`。
- 凭证可来自 `~/.codex/config.toml`、环境变量或 `~/.codex/auth.json`。
- 最直接的环境变量是 `OPENAI_API_KEY`。

```bash
git clone https://github.com/phonowell/mimikit.git
cd mimikit
pnpm i
```

```bash
export OPENAI_API_KEY=your_key
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY = "your_key"
```

### 2) 启动开发实例

一键启动（会先补 `config.toml`、执行 `pnpm install`，再启动 CLI）：

```bash
pnpm start -- --port 8787 --work-dir .mimikit
```

更适合日常内循环的直接入口：

```bash
tsx src/bootstrap/cli/index.ts --port 8787 --work-dir .mimikit
```

说明：没有单独的 agent / worker 启动命令；`manager + worker + WebUI` 都由同一 CLI 进程拉起。

### 3) 验证 WebUI / API

```bash
curl -sS http://127.0.0.1:8787/api/status
```

期望返回含 `ok`、`runtimeId`、`agentStatus`、`activeTasks`、`pendingTasks`、`managerRunning`、`maxWorkers` 的 JSON。

### 4) 常用命令

- `pnpm run bootstrap`：生成根目录 `config.toml`。
- `pnpm run lint`：含 BOM/CRLF/JSDoc/prompt/file-length guard 与 ESLint 修复。
- `pnpm run typecheck`：开发者友好别名，等价 `pnpm run type-check`。
- `pnpm run test`：运行 Vitest。
- `pnpm run build`：静态构建门禁；当前不产出 `dist/`，等价 `pnpm run type-check`。
- `pnpm run review-code-changes`：合流前门禁，串联 `lint + type-check + test`。
- `pnpm run manual:eval:traces-usage-ledger`：手动离线评测，读取仓库内 fixture；不属于默认回归。

### 5) 默认回归边界

- 默认门禁只有 `pnpm run review-code-changes`，也就是 `lint + type-check + test`。
- 手动 `eval:*`、`score:*` 与 `scripts/rearchitecture/*` 只用于离线分析或专项排查，不接入默认 CI。
- 仓库已移除会真实调用 manager provider 的 cache benchmark，避免把付费且高波动脚本误当成本地回归。

## 文档入口

- 开发者运行手册：`docs/BOOTSTRAP.md`
- 文档导航：`docs/README.md`
- 贡献约定：`CONTRIBUTING.md`
- 系统架构：`docs/design/architecture/system-architecture.md`

## 开发提示

- 默认工作流：`git fetch origin && git worktree add ../mimikit-<topic> -b <topic> origin/main`
- 调试入口：`.mimikit/log.jsonl`、`/api/status`、`/api/events`
- 主状态目录说明见 `docs/BOOTSTRAP.md` 与 `docs/design/workflow/interfaces-and-state.md`
