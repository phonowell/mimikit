# Codex SDK 迁移计划（Mimikit）

## 目标
- 以**可控、低风险、可度量**的方式从 `codex exec` 迁移到 Codex SDK。
- 先保持行为一致，再引入 SDK 专有优化（流式事件、线程复用）。

## 范围（已确认）
- Teller / Planner / Worker 全量迁移到 Codex SDK。
- 不保留 CLI 开关路径（SDK 作为唯一执行通道）。

## 计划（7 步）
1) 基线与盘点
   - 从 `.mimikit/log.jsonl` 提取按角色的 token/时延基线。
   - 记录当前 CLI flags 与运行假设到 `docs/codex-sdk.md`。

2) SDK 运行器适配层（不改行为）
   - 新增 SDK runner（新模块），输入/输出对齐现有 `execCodex`。
   - 不设置 CLI/SDK 开关（SDK 为默认且唯一通道）。
   - 统一结果结构：`output` / `usage` / `elapsedMs` / `events?`。

3) Teller/Planner 线程复用（仅进程内）
   - 线程仅保存在内存中；进程重启后新建线程并重新注入 history/memory。
   - 设计 TTL/重置策略，避免上下文污染。

4) 角色集成 SDK
   - `runTeller`/`runPlanner` 走 SDK。
   - `runWorker` 使用 SDK（等价 “yolo”= `sandboxMode: danger-full-access` + `approvalPolicy: never`）。
   - 初期保持 prompt 构建不变，避免行为漂移。
   - `runStreamed()` 先保留能力，默认关闭。
   - 立刻启用 `outputSchema` 替代 JSONL 工具解析。

5) 验证与指标
   - SDK vs 旧实现对比：输出正确性、token 用量、时延。
   - 每个角色至少收集 N 次会话样本。

6) 清理与下线（去掉不再需要的机制）
   - 删除 `codex exec` 进程管理与 JSONL 解析链路。
   - 删除 CLI 相关文档与引用。
   - 确认日志与 metrics 仍能覆盖需求后移除兼容分支。

## 可能涉及的文件
- src/llm/sdk-runner.ts
- src/roles/runner.ts
- src/supervisor/runner.ts
- src/config.ts
- src/log/（usage/event 记录）
- docs/codex-sdk.md

## 风险 / 未决问题
- SDK 会话持久化格式与稳定性。
- SDK 是否继承 `config.toml` / `CODEX_HOME` 配置。
- Skills/MCP 搜索路径在 SDK 下的实际行为。

## 决策点（已确认）
- 全量迁移 SDK（Teller/Planner/Worker）。
- 线程复用重置策略：100 次 / 6 小时。
- 不设置 CLI/SDK 开关。
