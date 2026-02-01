name: debug-automation
description: 自动复现 + 超时自修复 + smoke 回归
# Debug/Smoke 自动化工作流
## When to use
- LLM 卡住/重复超时，需要快速复现与自动调参
- 修复后做 smoke 回归

## 推荐流程
1) `pnpm debug:repro` 复现并自动调超时
2) 修复后重复 `pnpm debug:repro` 验证
3) `pnpm smoke:live --cases full --llm-verify` 回归
4) 线上持续报错时用 `pnpm debug:loop` 监控 + 自动重启

## Commands
- 复现（默认 `.mimikit` -> `.mimikit-smoke`）:
  - `pnpm debug:repro`
- 指定目录/命令:
  - `pnpm debug:repro --source-state-dir .mimikit --state-dir .mimikit-smoke --work-dir .`
  - `pnpm debug:repro --start-cmd "pnpm start:windows"`
- 守护监控（直接读当前 log）:
  - `pnpm debug:loop`
- 关闭 auto-fix:
  - `pnpm debug:repro --no-auto-fix`
  - `pnpm debug:loop --no-auto-fix`

## Auto-fix rules
- `window-sec` 内累计 `threshold` 次 `AbortError`/`llm_call_aborted` → 超时 +`timeout-step-sec`，上限 `timeout-max-sec`，然后重启（repro 会重放输入）。
- 超时定义为 **LLM 事件流空闲**，不是总耗时。

## Options / Env
- `--start-cmd` / `MIMIKIT_DEBUG_START_CMD`：默认 `pnpm start:windows`
- `--state-dir`：repro 默认 `.mimikit-smoke`；loop 默认 `.mimikit`
- `--log-path`：debug:loop 监听的日志路径
- `--source-state-dir` / `--replay-mode` / `--replay-count` / `--no-reset-state`：debug:repro 专用
- `--report-dir`：默认 `reports/diagnostics`
- `--timeout-initial-sec` / `MIMIKIT_TELLER_TIMEOUT_MS`（默认 120s，空闲）
- `--timeout-step-sec` / `--timeout-max-sec` / `--threshold` / `--window-sec` / `--restart-cooldown-sec`
- `--run-seconds`：repro 到点自动结束

## Outputs
- `reports/diagnostics/debug-repro-<timestamp>.json`
- `reports/diagnostics/auto-fix-<timestamp>.json`
- `reports/diagnostics/latest.md`
- `reports/smoke-live-<timestamp>.json` (from smoke:live)

## Notes
- debug:repro 会复制 state 并清空 inbox/log，避免污染线上状态。
- debug:loop 直接监听 `log.jsonl`，适合长时间守护。
