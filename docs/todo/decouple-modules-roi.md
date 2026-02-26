# 模块独立化下一步（ROI 排序）

更新时间：2026-02-26  
范围：`src/` 当前结构（focus/history 已独立后）

## 结论（高到低）

1. `Manager Action Engine`（ROI `9.3/10`）
2. `Task Lifecycle`（ROI `8.7/10`）
3. `Prompt Assembly`（ROI `8.1/10`）
4. `Runtime Event Bus`（ROI `7.6/10`）
5. `Provider Gateway`（ROI `7.2/10`）
6. `Storage Subdomains`（ROI `6.8/10`）

## 评估依据（数据）

- `src/` 总行数：`10985`
- 高 LOC 热点：
  - `src/manager/*`：`2525`
  - `src/orchestrator/*`：`1150`
  - `src/storage/*`：`1069`
  - `src/prompts/*`：`942`
  - `src/providers/*`：`903`
- 跨层依赖（import 计数）：
  - `manager -> orchestrator`: `27`
  - `manager -> shared`: `17`
  - `manager -> log`: `12`
  - `manager -> history`: `9`
  - `worker -> orchestrator`: `10`
  - `orchestrator -> manager`: `3`

## 模块建议

### 1) Manager Action Engine（最高优先）

原因：
- action 解析/校验/执行分散在多个 manager 文件，跨层依赖最多。
- 当前改动 manager action 容易波及 orchestrator/history/worker。

建议最小拆分范围：
- `src/manager/action-apply.ts`
- `src/manager/action-apply-create.ts`
- `src/manager/action-apply-intent.ts`
- `src/manager/action-feedback-validate.ts`
- `src/manager/action-apply-schema.ts`

目标边界：
- 形成独立 action domain（`parse -> validate -> apply`）。
- manager 主循环只做编排，不持有 action 细节。

### 2) Task Lifecycle

原因：
- 任务创建、状态迁移、取消、收尾横跨 manager/orchestrator/worker。
- 事务边界不清晰，失败路径（retry/cancel/finalize）维护成本高。

建议最小拆分范围：
- `src/orchestrator/core/task-state.ts`
- `src/manager/action-apply-create.ts`
- `src/worker/dispatch.ts`
- `src/worker/run-retry.ts`
- `src/worker/result-finalize.ts`

目标边界：
- 统一 task lifecycle API（enqueue/start/retry/finalize/cancel）。
- 业务策略与执行细节解耦。

### 3) Prompt Assembly

原因：
- prompt 组装已经是隐性业务层（focus/history/task-results 汇聚）。
- 当前 manager/worker 都感知拼装细节，认知负担高。

建议最小拆分范围：
- `src/prompts/build-prompts.ts`
- `src/prompts/format-content.ts`
- `src/prompts/format-messages.ts`
- `src/prompts/format-focus.ts`

目标边界：
- 固定输入契约（runtime snapshot in / prompt payload out）。
- 降低 manager/worker 对 prompt internals 的直接依赖。

### 4) Runtime Event Bus

原因：
- signals + queue + consume/publish 分散在 orchestrator/manager/streams。
- 该层是主干链路，测试与替换成本高。

建议最小拆分范围：
- `src/orchestrator/core/signals.ts`
- `src/streams/queues.ts`
- `src/manager/loop.ts`

目标边界：
- 统一事件发布/消费语义（input/result/system）。
- 便于后续替换底层存储实现。

### 5) Provider Gateway

原因：
- provider 配置读取、调用、错误模型分散，向上层渗透。
- 多 provider 策略切换时回归范围偏大。

建议最小拆分范围：
- `src/providers/openai-chat-provider.ts`
- `src/providers/codex-sdk-provider.ts`
- `src/providers/openai-settings.ts`
- `src/providers/registry.ts`

目标边界：
- 统一 provider 请求/响应/错误归一化。
- manager/worker 仅依赖稳定 gateway 接口。

### 6) Storage Subdomains

原因：
- storage 已独立，但内部仍是混合域（snapshot/jsonl/archive/results）。
- 二次拆分收益中等，适合在前 5 项之后推进。

建议最小拆分范围：
- `src/storage/runtime-snapshot.ts`
- `src/storage/jsonl.ts`
- `src/storage/task-results.ts`
- `src/storage/task-results-read.ts`

目标边界：
- snapshot / queue-log / archive 三类能力分仓。
- 降低单点文件改动连锁影响。

## 暂缓项（当前低 ROI）

- `types`、`shared`、`log`、`fs`

理由：
- 扇入虽高，但职责相对稳定；
- 现阶段拆分收益小于迁移成本。
