# 日志诊断收敛设计

## 目标

- 把日志系统从“信息分散但可用”收敛到“快速定位、稳定串联、低检索成本”。
- 优先补齐 manager round 与 worker failure 两条诊断断链。
- 保持现有四条证据线：`log.jsonl`、`task-progress`、`traces`、`usage/ledger`。

## 非目标

- 不新增独立 observability 服务、数据库或查询层。
- 不把现有状态层改造成第二套调度系统。
- 不扩写无关业务字段。

## 现状问题

- `log.jsonl` 同时由两套 logger 写入，两套 schema 不一致。
- manager round 缺少稳定关联键，`start/budget/provider/trace/end/ledger` 不能一跳串起。
- manager trace 落盘后没有进入可检索索引，失败路径更难追。
- retry / provider attempt 不是一等诊断字段。

## 方案

### 1. 统一诊断上下文

- 新增统一诊断上下文字段：
- `batchId`
- `roundId`
- `providerCallId`
- `attempt`
- `taskId`
- `threadId`
- `traceRef`

- `log.jsonl` 所有关键事件统一使用同一 logger 写入。
- provider 日志改为复用主日志写入器，消除 schema 分叉。

### 2. manager round 成为一等实体

- manager batch 开始时创建稳定 `batchId`，每个 round 再生成 `roundId`。
- `manager_start`、`manager_context_budget_resolved`、`llm_call_*`、`manager_action*`、`manager_end`、manager usage ledger 全部写 `roundId`。
- `manager_action`、`manager_action_feedback`、`manager_action_suppressed`、`manager_action_apply_feedback` 也都要显式挂 `batchId/roundId`，避免 correction round 靠时间拼链。
- manager trace frontmatter 写入 `batch_id/round_id/provider_call_id/thread_id`。

### 3. trace 建立反向索引

- manager 成功/失败都把 `traceRef` 回写到：
- `manager_end`
- manager usage ledger

- worker trace 继续通过 task result / task archive 暴露。
- trace 文件 frontmatter 补齐关联键，降低人工比对成本。

### 4. retry / attempt 诊断显式化

- worker provider 调用、worker trace、provider 失败日志统一写 `attempt`。
- session 复用尝试与最终 provider call 通过同一 `providerCallId` 或 `attempt` 关联。
- worker 失败/取消收口不能只剩 `traceRef`；异常对象要继续携带 `providerCallId/attempt`，最终 task result / archive / ledger 也要落这组字段。

### 5. 本地异常日志补强

- manager 关键失败日志补 `errorName`、`errorStack`、`threadId`、`traceRef`。
- 避免只剩 message，缩短定位本地逻辑 bug 的路径。

## 兼容与边界

- 保留既有事件名，但不保留旧 schema 兼容入口，不引入兼容层。
- 旧日志 fixture 与测试按新字段同步更新。
- 不修改用户目标、memory、focus 语义。

## 验证

- 先写失败测试覆盖：
- manager round id 在 `start/budget/end/ledger` 串联
- provider 日志写入统一 schema
- manager trace ref 在 end/ledger 可回查
- worker attempt 写入 provider log / trace
- manager error 日志带堆栈与 thread/trace 诊断字段

- 再跑现有日志、trace、ledger、archive 相关测试回归。
