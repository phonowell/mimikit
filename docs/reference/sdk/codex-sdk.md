# Codex SDK 参考（Mimikit）

> 更新时间：2026-03-24
> 基线版本：`@openai/codex-sdk@0.116.0`
> 官方入口：`https://developers.openai.com/codex/sdk`

## 用途

- 快速核对 Mimikit 当前真正接入了哪些 Codex SDK 能力。
- 避免把旧版本记忆或 CLI 能力误写成当前 SDK 事实。

## 事实边界

- OpenAI 官方文档页当前覆盖安装、`new Codex()`、`startThread()`、`resumeThread()`、`run()` 的最小用法。
- `runStreamed()`、`outputSchema`、`local_image`、线程选项细节以锁定版本 `@openai/codex-sdk@0.116.0` 的包 README 与类型定义为准。
- Mimikit 当前实现入口：`src/execution/providers/codex-sdk-provider.ts`、`src/execution/providers/codex-sdk-provider-helpers.ts`、`src/execution/providers/codex-stream.ts`。

## Mimikit 当前接入

- 客户端创建：使用 `new Codex()`；仅在配置代理时向 SDK 注入自定义 `env`。
- 线程生命周期：使用 `startThread()` / `resumeThread()`；worker 会回写并复用 `threadId`。
- 执行方式：统一走 `runStreamed()`，不使用缓冲式 `run()`。
- 本轮输出约束：按需传入 `outputSchema`。
- 当前线程参数：`workingDirectory`、`model`、`modelReasoningEffort`、`sandboxMode`、`approvalPolicy`。
- 当前策略固定值：`approvalPolicy='never'`；`sandboxMode` 按角色区分，`worker` 为 `danger-full-access`，`manager` 为 `read-only`。
- 部分输出：消费 `item.updated` / `item.completed` 中的 `agent_message.text`，做 partial output 节流回传。
- 结束与失败：消费 `turn.completed` 的 `usage`；将 `turn.failed` 和流级 `error` 统一映射为 provider error。
- 配置来源：SDK 实例本身不显式注入 `apiKey` / `baseUrl` / `config`；运行时仍依赖 Codex CLI 默认配置与 `~/.codex/config.toml`、环境变量、`~/.codex/auth.json`。

## SDK 已提供但 Mimikit 未接入

1. `local_image`：当前版本支持文本 + 本地图片混合输入，仓库尚未接线到 worker 请求模型。
2. `skipGitRepoCheck`：可在非 Git 工作目录跳过仓库检查，当前未开放。
3. `networkAccessEnabled`、`webSearchMode`、`webSearchEnabled`：SDK 已暴露网络与检索开关，当前 provider 未按任务透传。
4. `additionalDirectories`：可扩展多目录工作区，当前未接。
5. `item.started`：SDK 会发出条目开始事件，当前流处理未消费。

## 已从文档移除的旧结论

- 不再把 `remote_image` 写作当前 SDK 已确认能力；`0.116.0` 类型定义只暴露 `local_image`。
- 不再保留 `rateLimits`、`turn.cancelled`、`rate_limit.hit`、`jsReplEnabled`、`jsReplRuntimePath` 这组旧候选名；当前锁定版本 README 与类型定义未暴露这些接口名。

## 维护规则

- 升级 `@openai/codex-sdk` 后，同步更新此文件中的基线版本、已接入项、未接入项。
- 能力判断顺序固定为：仓库实现 > 锁定版本包 README / 类型定义 > 旧文档记忆。
- 若官方文档页与包 README 覆盖范围不同，以二者交集写“官方确认”，其余只写成“锁定版本包事实”，不要扩写猜测性候选项。
