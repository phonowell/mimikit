# Manager Cache 命中率改造与基准

## 改造目标
- 将 manager 输入构造拆分为“系统规则 + 稳定 packet + 易变 packet”，降低重复输入导致的 cache miss。
- 在固定场景下验证 `inputCacheRead / input >= 0.5`。

## 代码改造点
- prompt 链路拆分：`src/prompts/build-prompts.ts`
  - 新增 `buildManagerPromptPayload`。
  - 返回 `prefix/suffix/prompt/promptSegments`。
  - `recent_history` 从全文注入调整为摘要 + 指针（`id/role/time/focus_id`）。
  - `state_packet` 与 `remembered_memory` 放入稳定段；`event_packet` 与 `memory` 放入易变段。
- 模板拆分：
  - `prompts/manager/system.md` 仅保留系统规则。
  - `prompts/manager/context.md` 承载 `M:state_packet` / `M:event_packet` / `M:remembered_memory` / `M:memory`。
- provider 输入分段：
  - `src/providers/types.ts` 增加 `promptSegments`。
  - `src/providers/openai-responses-provider.ts` 将 `promptSegments` 编码为多段 `input`，并支持 `cache_control`。
- manager 调用链：
  - `src/manager/runner.ts` 使用 `buildManagerPromptPayload` 并传递 `promptSegments`。
  - `src/manager/loop-batch-exec.ts` / `src/manager/loop-batch-run-rounds.ts` 记录并校验 `promptPrefixHash` 稳定性。

## 稳定字段与变量字段
- 稳定段：
  - manager 系统规则（`prompts/manager/system.md`）
  - `M:state_packet`
  - `M:remembered_memory`
- 易变段：
  - `M:event_packet`
  - `M:memory`

## 可复现基准
- 脚本：`scripts/benchmark-manager-cache.ts`
- 命令：
  - `tsx scripts/benchmark-manager-cache.ts --rounds=8`
- 输出：
  - 每轮 `before_input / before_inputCacheRead / after_input / after_inputCacheRead`
  - 汇总 `before_ratio` 与 `after_ratio`
  - 目标判定 `target_met=true|false`
- 口径：
  - `before`：不启用 `promptSegments`，并将每轮变化标记注入到 prompt 前缀，统计真实 usage。
  - `after`：启用 `promptSegments`（系统规则 + 稳定 packet + 易变 packet），将同一每轮变化标记放在易变段，统计真实 usage。
  - 两组均在同一固定场景、同线程多轮执行，并输出逐轮对比。

## 回滚方案
- prompt 拆分回滚：
  - 将 `src/prompts/build-prompts.ts` 恢复为单模板渲染。
  - 删除 `prompts/manager/context.md`，并恢复 `prompts/manager/system.md` 的上下文段。
- provider 分段回滚：
  - 删除 `promptSegments` 相关类型与编码逻辑，恢复 `input: [{ role: 'user', content: request.prompt }]`。

## 验证命令
- `pnpm lint`
- `pnpm test`
