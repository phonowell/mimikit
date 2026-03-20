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
- 之后转到 `bin/mimikit` / `bin/mimikit.cmd`，并保留 restart 语义。

### 日常内循环入口

```bash
tsx src/cli/index.ts --port 8787 --work-dir .mimikit
```

- 适合已装好依赖后频繁重启调试。
- 支持 `--port`、`--work-dir`、`--log-actions`。
- `--work-dir` 默认值是 `.mimikit`。

### WebUI / agent / channel 说明

- 没有单独的 agent 守护进程；`manager + worker + WebUI` 都由同一 CLI 启动。
- Telegram / Feishu 只是额外输入通道，仍使用同一个启动命令。

Telegram:

```bash
export TELEGRAM_CHANNEL_ENABLED=true
export TELEGRAM_BOT_TOKEN=<your_bot_token>
export TELEGRAM_CHAT_ID=<your_chat_id>
pnpm start -- --port 8787 --work-dir .mimikit
```

Feishu:

```bash
export FEISHU_CHANNEL_ENABLED=true
export FEISHU_APP_ID=<your_app_id>
export FEISHU_APP_SECRET=<your_app_secret>
export FEISHU_CHAT_ID=<your_chat_id>
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
- `pnpm run typecheck`：开发者友好别名，等价 `pnpm run type-check`。
- `pnpm run test`：运行 `vitest run`。
- `pnpm run build`：静态构建门禁；当前仓库不产出 `dist/`，等价 `pnpm run type-check`。
- `pnpm run review-code-changes`：合流前门禁，串联 `lint + type-check + test`。

## 4. 调试入口

WebUI / HTTP 状态：

```bash
curl -sS http://127.0.0.1:8787/api/status
```

SSE 快照：

```bash
curl -sS -N http://127.0.0.1:8787/api/events | head -n 2
```

建议优先查看：

- `.mimikit/log.jsonl`：CLI action、runtime startup、manager budget 与恢复事件。
- `.mimikit/runtime-snapshot.json`：当前 runtime 持久化快照。
- `.mimikit/tasks/tasks.jsonl`：任务视图快照。
- `.mimikit/results/packets.jsonl`：worker 回写结果。
- `.mimikit/generated/worker-task-prompts/`：实际下发给 worker 的 prompt 快照。

更完整的接口与状态字段说明见 `docs/design/workflow/interfaces-and-state.md`。

## 5. `.mimikit/` 状态目录速查

- `inputs/packets.jsonl`：用户输入、触发器与系统输入包。
- `results/packets.jsonl`：worker 结果回流队列。
- `tasks/tasks.jsonl`：最近任务视图快照。
- `task-progress/YYYY-MM-DD/{taskId}.jsonl`：任务进度事件流。
- `tasks/YYYY-MM-DD/*.md`：任务归档。
- `memory/MEMORY.md`：持久化 memory。
- `generated/worker-task-prompts/YYYY-MM-DD/{taskId}.md`：worker prompt 快照。
- `usage/ledger.jsonl`：manager / worker 用量账本。
- `runtime-snapshot.json`：启动恢复的核心快照。
- `runtime/lease.json`、`runtime/children.json`、`runtime/reaper.json`：实例 lease、子进程注册与回收信息。
- `.instance`：实例锁文件；同一 `--work-dir` 只能被一个进程占用。

## 6. 常见排障

- `OPENAI_API_KEY is missing`：provider 没拿到凭证；先查 `~/.codex/config.toml`、环境变量、`~/.codex/auth.json`。
- `[cli] instance lock exists at .../.mimikit/.instance`：同一状态目录已有实例占用；换 `--work-dir` 或先停掉旧进程。
- `[cli] port 8787 is in use, fallback to ...`：端口已被占用；CLI 会在目标端口后 20 个端口内自动寻找空位。
- `pnpm start` 很慢：它会额外执行 `pnpm install`；内循环调试改用 `tsx src/cli/index.ts --port 8787 --work-dir .mimikit`。
- `pnpm run build` 没有生成产物：这是预期行为；当前仓库没有独立编译产物，`build` 只负责静态门禁。

## 7. 推荐开发流程

```bash
git fetch origin
git worktree add ../mimikit-<topic> -b <topic> origin/main
cd ../mimikit-<topic>
pnpm run review-code-changes
```

- 合流前统一跑 `pnpm run review-code-changes`。
- 文档入口收敛到本页；设计事实继续看 `docs/design/**`。

## 8. 延伸阅读

- 文档导航：`docs/README.md`
- 系统架构：`docs/design/architecture/system-architecture.md`
- 接口与状态：`docs/design/workflow/interfaces-and-state.md`
- Telegram 接入：`docs/reference/integrations/telegram-channel.md`
- Feishu 接入：`docs/reference/integrations/feishu-channel.md`
