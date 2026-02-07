# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- GET / → WebUI
- GET /api/status
- POST /api/input（支持可选字段：clientLocale / clientTimeZone / clientOffsetMinutes / clientNowIso / language）
- POST /api/feedback（支持字段：severity(low|medium|high) / message / context{input,response,note}）
- POST /api/evolve/code（触发“代码+Prompt”自演进轮次，按空闲策略执行）
- GET /api/messages?limit=...
- GET /api/messages/export?limit=...（导出人类可读 markdown）
- GET /api/tasks?limit=...
- POST /api/restart
- POST /api/reset

实现：`src/http/index.ts`；WebUI 静态文件在 `src/webui/`。

## CLI
- `tsx src/cli.ts`
- `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts --state-dir .mimikit --work-dir .`

### 回放评测 CLI
- `pnpm replay:eval -- --suite test/fixtures/replay/manager-core.json --out .mimikit/generated/replay/last.json --md .mimikit/generated/replay/last.md`
- 必填：`--suite` `--out`
- 可选：`--md` `--model` `--seed` `--temperature` `--offline` `--prefer-archive` `--archive-dir` `--max-fail` `--timeout-ms` `--state-dir` `--work-dir`
- 退出码：`0` 全通过，`1` 断言失败，`2` 运行错误/样本格式错误

### 环境变量
- `MIMIKIT_MODEL`：覆盖 manager model（默认 `gpt-5.2-high`）
- `MIMIKIT_WORKER_MODEL`：覆盖 worker model（默认 `gpt-5.3-codex-high`）
- `MIMIKIT_REASONING_EFFORT`：设置 manager reasoning effort（`minimal|low|medium|high|xhigh`）
- `MIMIKIT_TOKEN_BUDGET_DAILY`：覆盖每日 token 预算（正整数）
- `MIMIKIT_TOKEN_BUDGET_ENABLED`：预算开关（`true|false|1|0`）
- `MIMIKIT_EVOLVE_ENABLED`：空闲轮次自演进开关（`true|false|1|0`）
- `MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE`：演进通过后自动重启开关（`true|false|1|0`）
- `MIMIKIT_EVOLVE_IDLE_POLL_MS`：空闲轮询间隔（正整数）
- `MIMIKIT_EVOLVE_MAX_ROUNDS`：每次空闲自演进最大迭代轮数（正整数）
- `MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA`：通过率提升阈值（非负数）
- `MIMIKIT_EVOLVE_MIN_TOKEN_DELTA`：Token 下降阈值（非负整数）
- `MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS`：LLM 延时下降阈值（非负整数）
- `MIMIKIT_EVOLVE_FEEDBACK_HISTORY_LIMIT`：每次取最新反馈样本上限（正整数）
- `MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES`：反馈派生回放样本上限（正整数）
- `MIMIKIT_EVOLVE_ISSUE_MIN_ROI_SCORE`：进入执行队列的最低 ROI 分数（非负整数）
- `MIMIKIT_EVOLVE_ISSUE_MAX_COUNT_PER_ROUND`：每轮最多处理的问题数（正整数）
- `MIMIKIT_EVOLVE_IDLE_REVIEW_ENABLED`：空闲会话主动回顾开关（`true|false|1|0`）
- `MIMIKIT_EVOLVE_IDLE_REVIEW_INTERVAL_MS`：空闲主动回顾最小间隔（正整数）
- `MIMIKIT_EVOLVE_IDLE_REVIEW_HISTORY_COUNT`：空闲回顾读取历史条数（正整数）
- `MIMIKIT_EVOLVE_RUNTIME_HIGH_LATENCY_MS`：高耗时信号阈值（正整数）
- `MIMIKIT_EVOLVE_RUNTIME_HIGH_USAGE_TOTAL`：高 token 消耗信号阈值（正整数）

### 默认配置（节选）
- `tokenBudget.enabled = true`
- `tokenBudget.dailyTotal = 500000000`
- `manager.pollMs = 1000`
- `manager.debounceMs = 10000`
- `manager.maxResultWaitMs = 20000`
- `manager.tasksMaxCount = 20`
- `manager.tasksMinCount = 5`
- `manager.tasksMaxBytes = 20480`
- `worker.retryMaxAttempts = 1`
- `worker.retryBackoffMs = 5000`

说明：manager 已对 tasks 与 history 都按 `min/max/maxBytes` 窗口裁剪后再注入 prompt。

定义位置：`src/config.ts`
