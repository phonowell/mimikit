# src 领域重划方案（已实现）

- status: done
- date: 2026-03-24
- worktree: `../mimikit-src-domain-repartition-20260324`

## 已落地结构

- `src/bootstrap/*`：CLI、配置装配、默认配置解析
- `src/kernel/*`：runtime 生命周期、signals、queue、channel/session 过程态
- `src/work/*`：focus、task/user-choice 状态迁移、task 共享语义、task 类型
- `src/policy/*`：manager 策略、action 协议、memory 策略、manager prompts
- `src/execution/*`：worker、providers、worker prompts、执行侧共享能力
- `src/surface/*`：HTTP、channels、read-model、surface shared/types
- `src/persistence/*`：fs、storage、history、log
- `src/foundation/*`：通用 shared/types/prompting 基件

## 关键拆分

- `orchestrator/core` 已拆入 `kernel/orchestrator`、`work/orchestrator`、`surface/orchestrator`
- `prompts` 已拆入 `foundation/prompting`、`policy/prompts`、`execution/prompts`
- `memory` 已拆入 `work/memory` 与 `policy/memory`
- `shared` / `types` 已按 owner 回收，不再保留旧顶层真相源

## 同步项

- 启动入口与结构说明已更新到 `AGENTS.md`、`CLAUDE.md`、`docs/design/*`
- prompt guard 与 file-length exemptions 已改到新目录
- 全量导入、脚本、测试路径已切到新结构

## 验证

- `pnpm type-check`
- `pnpm lint`
- `pnpm test`
