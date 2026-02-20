# Codex SDK 参考（Mimikit）

> 更新时间：2026-02-14
> 基线版本：`@openai/codex-sdk@0.101.0`

## 阅读入口

- 协议与 API：`./codex-sdk-api.md`
- Mimikit 接入与建议：`./codex-sdk-integration.md`

## 适用场景

- 需要核对 `ThreadOptions`、事件协议、`ThreadItem` 类型。
- 需要评估 Mimikit 已接入能力与下一步接入 ROI。

## 当前实现边界（摘要）

- 已使用：`startThread` + `runStreamed` + `outputSchema` + usage 统计。
- 待接入高价值：`resumeThread`、图片输入、网络/检索开关、`additionalDirectories`。
- 待评估：`rateLimits`、`turn.cancelled`、`rate_limit.hit`。

## 维护约束

- 版本升级时，先更新 `codex-sdk-api.md` 的“版本日志/参数表”。
- 接入状态变更时，只改 `codex-sdk-integration.md`，避免重复维护。
