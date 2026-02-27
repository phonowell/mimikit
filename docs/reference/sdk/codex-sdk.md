# Codex SDK 参考（Mimikit）

> 更新时间：2026-02-27
> 基线版本：`@openai/codex-sdk@0.101.0`

## 用途

- 快速核对 Mimikit 当前已接入能力。
- 判断下一步接入项的 ROI 与风险。

## Mimikit 当前接入

- 已使用：`new Codex()`、`startThread()`、`runStreamed()`、`outputSchema`、usage 统计。
- 常用线程参数：`workingDirectory`、`sandboxMode`、`approvalPolicy`、`modelReasoningEffort`。
- 失败处理：`turn.failed` 与流级 `error`。

实现入口：`src/providers/codex-sdk-provider.ts`

## 高 ROI 待接入

1. `resumeThread(id)`：减少跨轮上下文重建成本。
2. `local_image` / `remote_image`：支持图像输入任务。
3. `networkAccessEnabled`、`webSearchMode`、`webSearchEnabled`：网络与检索能力按任务启停。
4. `additionalDirectories`：多目录工作区场景。

## 待评估（中 ROI）

- `rateLimits`：高并发下的配额治理。
- `turn.cancelled` / `rate_limit.hit`：细粒度状态反馈。
- `jsReplEnabled` / `jsReplRuntimePath`（实验性）：仅在明确需要跨工具持久状态时启用。

## 关键事件（runStreamed）

- 生命周期：`thread.started`、`turn.started`、`turn.completed`、`turn.failed`、`turn.cancelled`。
- 条目流：`item.started`、`item.updated`、`item.completed`。
- 其他：`error`、`rate_limit.hit`。

## 维护规则

- 升级 SDK 版本时，仅更新此文件中的“基线版本 + 能力矩阵”。
- 若接入状态变化，更新“当前接入/待接入/待评估”三段。
- 不再拆分 API 与集成文档，避免重复维护。
