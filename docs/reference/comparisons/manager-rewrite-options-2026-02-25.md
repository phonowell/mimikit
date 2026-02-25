# Manager 改写调研归档（2026-02-25）

## 目标与约束

- 目标：降低 manager 侧 token 成本，减少对 codex 的全量依赖。
- 约束：保留现有 orchestrator/runtime 稳定性，避免大范围回归。

## 现状（mimikit）

- 主链路：`src/manager/loop.ts` → `src/manager/loop-batch.ts` → `src/manager/loop-batch-run-manager.ts` → `src/manager/runner.ts`
- codex 耦合核心：`src/manager/runner.ts` 固定 `provider: 'codex-sdk'`
- 成本守卫已存在：`src/manager/runner-budget.ts`（默认 maxTokens=8192，超限裁剪 `tasks/results`）
- 历史/压缩机制：`src/manager/history-query.ts`、`src/manager/action-apply-compress.ts`

## 外部实现（pi-mono）

- 默认角色强绑定编码助手：`packages/coding-agent/src/core/system-prompt.ts`
- 默认工具偏代码与终端：`read/bash/edit/write`（见 `packages/coding-agent/src/core/system-prompt.ts`、`packages/coding-agent/src/cli/args.ts`）
- 可复用能力：会话树与分支管理（`packages/coding-agent/src/core/session-manager.ts`）、上下文压缩策略（`packages/coding-agent/src/core/compaction/compaction.ts`）
- 迁移风险：依赖 `pi-agent-core` 与 extension runner 生态，直接整合改造面大

## 方案对比

| 方案 | 成本可控性 | 实施复杂度 | 能力风险 | 结论 |
| --- | --- | --- | --- | --- |
| 自研 manager-lite | 高 | 中 | 中 | 推荐 |
| 直接接入 pi-mono | 中 | 高 | 中低 | 不推荐整套接入 |
| 混合（自研 + 借鉴算法） | 高 | 中 | 低中 | 推荐落地路径 |

## 决策

- 推荐：`自研 manager-lite + 定向借鉴 pi-mono`
- 不推荐：直接将 pi-mono 作为完整 manager 运行时接入

## 建议落地路径

1. 保留 loop/runtime/history 主骨架，不改调度协议。
2. 将 manager runner 做成可插拔引擎（示例：`MANAGER_ENGINE=codex|lite`）。
3. lite 首版只保留最小动作集：回复、任务分发、简化 history 查询。
4. 增加硬成本守卫：token 上限、阈值触发压缩、降级模板回复。
5. 通过 A/B 对比验证：成本、任务完成率、错误率。

## 验收指标（建议）

- 单轮平均 token：较当前下降 ≥40%
- 同类任务完成率：不低于当前基线的 95%
- manager 超时率：不高于当前基线
- 回退到 codex 比例：持续下降并稳定在可接受区间
