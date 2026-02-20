# OpenCode SDK 参考（Mimikit）

> 更新时间：2026-02-14
> 基线版本：`@opencode-ai/sdk@1.2.0`

## 阅读入口

- API 与会话模型：`./opencode-sdk-api.md`
- 类型与错误处理：`./opencode-sdk-types-and-errors.md`
- Mimikit 接入与选型：`./opencode-sdk-integration.md`

## 适用场景

- 需要确认 OpenCode 的会话/消息/WebSocket API。
- 需要对比 OpenCode 与 Codex SDK 的集成策略。

## 当前实现边界（摘要）

- 已使用：session 创建、message create/list、基础错误处理。
- 可直接接入：会话元数据、WebSocket stream、批量会话管理。
- 待评估：与 Codex 双栈路由策略、成本与故障切换策略。

## 维护约束

- SDK 版本升级后先同步 API 与类型文档。
- Provider 选型变更统一在 `opencode-sdk-integration.md` 更新。
