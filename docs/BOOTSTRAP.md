# 开发者运行手册

目标：让新同事在 30 分钟内完成安装、启动、验证，并知道排障入口在哪里。

## 1. 前置准备

- CI 基线：Node `22`、`pnpm@10.28.2`。
- provider 凭证优先从 `~/.codex/config.toml` 读取；其次支持环境变量与 `~/.codex/auth.json`。
- 最简单的本地配置是直接导出 `OPENAI_API_KEY`。
- 根目录 `config.toml` 不必手写；`pnpm run bootstrap` 或 `pnpm start` 会在缺失时从 `defaults/config.template.toml` 生成。

```bash
git clone https://github.com/phonowell/mimikit.git
cd mimikit
pnpm i
pnpm run bootstrap
```

```bash
export OPENAI_API_KEY=your_key
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY = "your_key"
```

## 2. 启动入口

### 开发默认入口

```bash
pnpm start -- --port 8787 --work-dir .mimikit
```

- `pnpm start` 实际运行 `scripts/start.ts`。
- 启动前会先执行 `node scripts/bootstrap.mjs`，再执行一次 `pnpm install`。
- 之后直接启动 `src/bootstrap/cli/index.ts`；restart / crash recovery 由 CLI 内建 supervisor 负责。

### 日常内循环入口

```bash
tsx src/bootstrap/cli/index.ts --port 8787 --work-dir .mimikit
```

- 适合已装好依赖后频繁重启调试。
- 支持 `--port`、`--work-dir`、`--log-actions`。
- `--work-dir` 默认值是 `.mimikit`。

### WebUI / agent / channel 说明

- 没有单独的 agent 守护进程；`manager + worker + WebUI` 都由同一 CLI 启动。
- Telegram 只是额外输入通道，仍使用同一个启动命令。

Telegram:

```bash
export TELEGRAM_CHANNEL_ENABLED=true
export TELEGRAM_BOT_TOKEN=<your_bot_token>
export TELEGRAM_CHAT_ID=<your_chat_id>
pnpm start -- --port 8787 --work-dir .mimikit
```

关闭 CLI action 日志输出：

```bash
MIMIKIT_ACTION_LOGS=false pnpm start -- --port 8787 --work-dir .mimikit
```

## 3. 常用命令

- `pnpm run bootstrap`：生成缺失的 `config.toml`。
- `pnpm run guard:file-length`：阻止新增超长文件与豁免债务继续膨胀。
- `pnpm run lint`：运行 file-length guard、BOM/CRLF/JSDoc/prompt 处理与 ESLint `--fix`。
- `pnpm run lint:changed-tests`：仅对当前工作区里改动过的 `tests/**` JS/TS 文件跑 ESLint；改到测试文件时必跑。
- `pnpm run typecheck`：开发者友好别名，等价 `pnpm run type-check`。
- `pnpm run test`：运行 `vitest run`。
- `pnpm run build`：执行 `type-check + build:webui`，并生成 `webui/generated/app.js`。
- `pnpm run review-code-changes`：合流前门禁，串联 `lint + lint:changed-tests + type-check + build:webui + test`。
- `pnpm run manual:eval:traces-usage-ledger`：手动离线评测，基于提交到仓库的 trace/ledger fixture。

## 4. 默认回归边界

- 默认回归只包含 `pnpm run review-code-changes`。
- `manual:eval:*`、`score:*` 与 `scripts/rearchitecture/*` 属于手动分析入口，不在默认 CI / 合流门禁中执行。
- 会真实调用 provider、带成本或易波动的 benchmark 不应进入仓库默认路径；当前这类 manager cache benchmark 已移除。

## 5. 调试入口

WebUI / HTTP 状态：

```bash
curl -sS http://127.0.0.1:8787/api/status
```

SSE 快照：

```bash
curl -sS -N http://127.0.0.1:8787/api/events | head -n 2
```

建议优先查看：

- `.mimikit/log.jsonl`：统一 JSONL 日志；manager / worker / provider 共用同一 schema。排障优先看 `batchId/roundId/providerCallId/taskId/traceRef`；manager action / followup / suppressed / failure 收口也都挂在同一组键上。
- `.mimikit/runtime-snapshot.json`：当前 runtime 持久化快照。
- `.mimikit/tasks/tasks.jsonl`：任务视图快照。
- `.mimikit/results/packets.jsonl`：worker 回写结果。
- `.mimikit/generated/worker-task-prompts/`：按需外置的任务说明快照；完整 worker runner prompt 仍由系统模板动态包裹。

更完整的接口与状态字段说明见 `docs/design/workflow/interfaces-and-state.md`。

## 6. `.mimikit/` 状态目录速查

- `inputs/packets.jsonl`：用户输入、触发器与系统输入包。
- `results/packets.jsonl`：worker 结果回流队列。
- `tasks/tasks.jsonl`：最近任务视图快照。
- `task-progress/YYYY-MM-DD/{taskId}.jsonl`：任务进度事件流；包含 `worker_start`、运行中的 `worker_activity`、脱敏后的 `worker_live_output` 摘要，以及结束态事件。运行中打开 task archive 时，会优先回读当前进程内 `liveOutput`，缺失时再回退到当前运行轮次最近一次落盘的 `worker_live_output` 摘要。
- `tasks/YYYY-MM-DD/*.md`：任务归档。
- `memory/MEMORY.md`：持久化 memory。
- `generated/worker-task-prompts/YYYY-MM-DD/{taskId}.md`：外置任务说明快照。
- `usage/ledger.jsonl`：manager / worker 用量账本；关键记录会附带 `batchId/roundId/providerCallId/traceRef/attempt` 诊断字段。
- `traces/YYYY-MM-DD/*.txt`：manager / worker trace；frontmatter 会补 `batch_id/round_id/provider_call_id/attempt_number/thread_id`，失败 trace 也保留这组关联键。
- `runtime-snapshot.json`：启动恢复的核心快照。
- `runtime/lease.json`、`runtime/children.json`、`runtime/reaper.json`：实例 lease、子进程注册与回收信息。
- `.instance.lock`：实例锁目录；同一 `--work-dir` 只能被一个进程占用。

## 7. 常见排障

- `OPENAI_API_KEY is missing`：provider 没拿到凭证；先查 `~/.codex/config.toml`、环境变量、`~/.codex/auth.json`。
- `[cli] instance lock exists at .../.mimikit/.instance.lock`：同一状态目录已有实例占用；换 `--work-dir` 或先停掉旧进程。
- `[cli] port 8787 is in use, fallback to ...`：端口已被占用；CLI 会在目标端口后 20 个端口内自动寻找空位。
- `pnpm start` 很慢：它会额外执行 `pnpm install`；内循环调试改用 `tsx src/bootstrap/cli/index.ts --port 8787 --work-dir .mimikit`。
- `pnpm run build` 修改了 `webui/generated/app.js`：这是预期行为；当前构建会刷新 WebUI 浏览器产物。

## 8. 推荐开发流程

```bash
git fetch origin
git worktree add ../mimikit-<topic> -b <topic> origin/main
cd ../mimikit-<topic>
pnpm run review-code-changes
```

- 合流前统一跑 `pnpm run review-code-changes`。
- 若本轮改到了 `tests/**`，至少额外跑一次 `pnpm run lint:changed-tests`，不要只依赖 `type-check`。
- 文档入口收敛到本页；设计事实继续看 `docs/design/**`。

## 9. 延伸阅读

- 文档导航：`docs/README.md`
- 系统架构：`docs/design/architecture/system-architecture.md`
- 接口与状态：`docs/design/workflow/interfaces-and-state.md`
- Telegram 接入：`docs/reference/integrations/telegram-channel.md`
