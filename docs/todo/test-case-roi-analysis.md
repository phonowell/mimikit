# 测试用例冗余与低 ROI 分析（待裁剪）

更新时间：2026-02-26  
范围：`test/*.test.ts`（`10` 文件 / `48` 用例）  
数据来源：`pnpm -s vitest run test --reporter=json`（本地）

## 结论

1. 当前总用例数 `48`，距离上限 `50` 仅剩 `2` 个名额，新功能几乎没有新增空间。
2. 存在一批“同实现路径重复验证”与“仅验证无反馈（`length === 0`）”的低 ROI 用例，可优先裁剪。
3. 保守裁剪 `5~7` 条即可回到健康区间（`41~43` 条），并释放未来迭代预算。

## 数据快照

- 总断言耗时（assertion duration）：`320.667ms`
- 文件级耗时 Top：
  - `test/manager-action-apply.test.ts`：`68.445ms`（`7` 条）
  - `test/queues.test.ts`：`67.381ms`（`5` 条）
  - `test/messages-route.test.ts`：`45.206ms`（`4` 条）
  - `test/runtime-snapshot.test.ts`：`41.270ms`（`7` 条）
- 单条耗时 Top：
  - `test/messages-route.test.ts:22` `status route returns runtime id`（`33.98ms`）
  - `test/queues.test.ts:108` `input queue compacts when fully consumed`（`24.28ms`）
  - `test/module-boundary.test.ts:176` `src modules respect key boundary constraints`（`21.35ms`）

## 高置信裁剪候选（低风险）

| 优先级 | 位置 | 类型 | 低 ROI 原因 | 建议 |
| --- | --- | --- | --- | --- |
| P1 | `test/queues.test.ts:66` + `test/queues.test.ts:80` | 重复路径 | 两条都走 `src/streams/queues.ts:24` 的 `consumeQueuePackets`，仅队列类型不同；底层由 `createQueueOps` 复用（`src/streams/queues.ts:63,88,89`） | 保留一条消费路径测试，另一条下线 |
| P1 | `test/queues.test.ts:108` + `test/queues.test.ts:126` | 重复路径 | 两条都走 `src/streams/queues.ts:46` 的 `compactQueueIfFullyConsumed`，仅输入/结果队列分支不同 | 保留一条压缩路径测试，另一条下线 |
| P1 | `test/manager-action-feedback.test.ts:123` | 弱信号正例 | 仅断言合法 `create_intent` 返回空反馈；与大量负例相比回归捕获价值低 | 优先下线 |
| P1 | `test/manager-action-feedback.test.ts:165` | 弱信号正例 | 仅断言合法 `compress_context` 返回空反馈；核心异常分支已被 `:152` 覆盖 | 优先下线 |
| P2 | `test/runtime-snapshot.test.ts:19` | 通路重复 | `selectPersistedTasks` 的“非 running 状态保持不变”是直通语义，核心变换行为已由 `:59` 覆盖 | 可下线 |
| P2 | `test/messages-route.test.ts:22` | 低信息量接口烟测 | 只验证 `/api/status` 的固定字段，价值低于输入校验与 archive 回退路径（`:40/:85/:104`） | 可下线 |

## 有争议候选（需先确认策略）

| 位置 | 争议点 | 说明 | 建议 |
| --- | --- | --- | --- |
| `test/manager-action-feedback.test.ts:36` + `test/manager-action-apply.test.ts:124` | 跨层重复防御 | 同一“受保护 `.mimikit` 路径拒绝”在“反馈层”和“执行层”各测一次 | 若坚持双层防御可都保留；若偏向预算可保留执行层、下线反馈层 |
| `test/manager-prompt-template.test.ts:40/:51/:61` | 条件块重复形态 | 三条都验证 `renderPromptTemplate` 的同类条件块渲染（`src/prompts/format.ts:104-119`） | 仅在明确要压缩测试预算时再减 1~2 条 |

## 建议执行顺序

1. 先执行 P1（预计 `-4` 条）：`48 -> 44`
2. 再执行 P2（预计 `-2` 条）：`44 -> 42`
3. 仍需空间时再从“有争议候选”中减 `1~2` 条

## 不建议动的高 ROI 用例

- `test/module-boundary.test.ts`：架构边界/循环依赖回归防线
- `test/worker-result-finalize.test.ts`：取消任务结果收尾语义（状态一致性）
- `test/runtime-snapshot.test.ts:198/:240/:263`：快照兼容与备份恢复链路
