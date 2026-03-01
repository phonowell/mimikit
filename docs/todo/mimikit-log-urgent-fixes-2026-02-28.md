# .mimikit 日志紧急修复清单（2026-02-28）

范围：`.mimikit/log.jsonl`、`.mimikit/history/2026-02-28.jsonl`、`.mimikit/traces/2026-02-28/*.txt`

结论：当前有 9 项需要优先修复（P0 x2，P1 x7），其中 5 项来自对话行为推断。

## P0

### 1) Manager 在 history 检索无进展时报错并对用户回退为 Service unavailable
- 现象：出现 `manager_query_history_repeated_without_progress`，随后用户收到 `Service unavailable. Try again soon.`。
- 证据：`.mimikit/log.jsonl:34`，`.mimikit/history/2026-02-28.jsonl:24`，`.mimikit/history/2026-02-28.jsonl:25`。
- 影响：核心对话链路中断，用户可见失败。
- 修复：
  - 在 `manager_query_history` 连续无进展时走“可恢复降级”而非 `manager_end status=error`。
  - 降级路径应输出可执行澄清问题或安全默认回复，不返回泛化的 service unavailable。
- 验收：同场景下不再写入 `manager_end status=error`；用户侧不再出现 `Service unavailable`。

### 2) `run_task` 路径策略误伤，导致大量 `action_execution_rejected`
- 现象：同一类任务多次被拒绝，提示“禁止访问 `.mimikit` 受保护路径（仅允许 `.mimikit/generated`）”。
- 证据：`.mimikit/log.jsonl:70`、`:71`、`:85`、`:94`、`:96`、`:101`、`:105`、`:132`；trace 见 `.mimikit/traces/2026-02-28/0mm61ap3vmp.txt:225`。
- 影响：任务无法推进，且触发重复纠错轮次与额外 token 消耗。
- 修复：
  - 将路径策略改为“按真实访问路径判定”，不要因 prompt 文本里提到受保护路径就拒绝。
  - 明确允许 `generated/` 与 `.mimikit/generated`，并在错误提示中返回可替代路径。
- 验收：涉及 `generated` 产物写入的 `run_task` 不再被误拒；`action_execution_rejected` 显著下降。

## P1

### 3) 对同类拒绝缺少熔断，出现重复重试风暴
- 现象：同类 `action_execution_rejected` 连续出现 8 次。
- 证据：`.mimikit/log.jsonl:70`、`:71`、`:85`、`:94`、`:96`、`:101`、`:105`、`:132`。
- 影响：无效重试拉高延迟与成本，并加剧用户等待。
- 修复：
  - 同类错误达到阈值（如 2 次）后自动熔断。
  - 直接返回“可执行替代方案 + 下一步 action”，禁止继续同参数重试。
- 验收：同一 trace 内相同错误不超过 2 次；出现熔断日志与替代方案日志。

### 4) 缺少长任务预算控制，单任务耗时/消耗过高
- 现象：存在 >10 分钟任务与超高 token 消耗。
- 证据：`.mimikit/log.jsonl:100`（`durationMs=1568013`，`usage.total=11031722`），`.mimikit/log.jsonl:57`（`durationMs=664739`，`usage.total=5804640`）。
- 影响：系统成本与排队时延被放大，且取消后的沉没成本高。
- 修复：
  - 为 worker 增加软/硬预算（时长、token、纠错轮次）与中途汇报检查点。
  - 超预算时自动降级为“产出部分结果 + 请求用户确认继续”。
- 验收：超预算任务可被提前降级；10 分钟以上任务占比明显下降。

## 来自 User-Agent 对话的推断（新增）

### 5) 串行依赖未被执行器硬约束（改动前先跑 review）
- 现象：用户要求“先改动再 review”，但系统已先创建 review 任务，用户随后指出流程应串行。
- 证据：`.mimikit/history/2026-02-28.jsonl:55`，`:57`，`:59`。
- 影响：评审结论可能过时，造成重复执行与用户干预。
- 修复：
  - 增加任务前置条件（dependency gate）：`review` 必须依赖 `implement/fix` 完成态。
  - 若前置条件不满足，自动挂起而非启动。
- 验收：同类“改动->review->land”流程中，不再出现改动前启动 review。

### 6) `quote` 功能语义弱（多数场景只传 ID，不传被引用内容）
- 现象：输入里有 `quote`，但通常只携带消息 ID；被引用正文不保证进入同轮上下文，导致引用对决策帮助弱。
- 证据：
  - 发送链路仅上传 `quote` ID：`webui/messages/send.js:33-34`。
  - 服务端仅继承 focus 并记录 `quote`：`src/orchestrator/core/orchestrator-runtime-ops.ts:48-55`。
  - Prompt 中输入只含 `quote` ID：`.mimikit/traces/2026-02-28/0mm61m9xsmp.txt:107-114`。
  - 同轮 `recent_history` 不含该引用目标正文：`.mimikit/traces/2026-02-28/0mm61m9xsmp.txt:148-190`。
- 影响：用户“引用上一条”的意图难以稳定被模型正确理解，体感接近“quote 没作用”。
- 修复：
  - 在 `M:inputs` 注入 `quote_ref`（角色、时间、正文摘要），不要只给 ID。
  - 对本轮被引用消息设为“上下文保留项”（优先于普通 recent history 裁剪）。
  - 在 `prompts/manager/system.md` 增加规则：出现 `quote` 时优先围绕被引用内容答复。
- 验收：引用场景下，回复与被引用消息语义一致率明显提高；“引用无效”反馈下降。

### 7) 多任务编排去重缺失（同主题重复探索）
- 现象：围绕 worktree 理解主题创建了语义相近的重复任务。
- 证据：`.mimikit/history/2026-02-28.jsonl:16`，`:19`，`:21`，`:26`。
- 影响：资源浪费，且增加用户对“到底哪个任务有效”的认知负担。
- 修复：
  - 任务创建前做语义去重（同 focus + 同主题 + 运行中任务 => 复用）。
  - 必要时合并结果而非并行重复跑。
- 验收：相同主题重复 task 创建次数明显下降。

### 8) 上下文切换不稳，出现答非所问
- 现象：用户说“时间任务就分配在 wt-1”，回复先讨论了 wt-2 评审取消，后续才回到 wt-1。
- 证据：`.mimikit/history/2026-02-28.jsonl:63`，`:64`，`:66`。
- 影响：用户感知为“指令未被立即执行”，降低可控性。
- 修复：
  - 回复模板增加“先确认并执行当前指令，再补充旁路信息”的顺序约束。
  - 旁路信息放到“补充说明”段，默认不抢主回答首段。
- 验收：主问题首段命中率提高，离题回复比例下降。

### 9) `intent/task` 可见性缺口（同一根因：Manager 上下文经常看不到可操作对象）
- 现象：
  - 用户问“当前任务状态/ID”，agent 回复看不到实时任务列表。
  - 用户按标题要求删除 intent，agent 因拿不到可匹配对象而无法执行。
- 证据：
  - 对话记录：`.mimikit/history/2026-02-28.jsonl:31`，`:32`，`:88`，`:90`。
  - 代表性 trace 中 `M:tasks`/`M:intents` 均缺失：`.mimikit/traces/2026-02-28/0mm60mn8emp.txt`（`tasks_tag=0`，`intents_tag=0`）。
  - 裁剪顺序优先移除 `M:intents`/`M:tasks`：`src/manager/manager-llm-call.ts:8-10`。
- 影响：agent 无法稳定做“查状态、删 intent、精确取消 task”等操作，只能反复追问 ID。
- 修复：
  - 新增轻量只读 action：`query_tasks`、`query_intents`（支持 `id|title|focus|status` 过滤）。
  - Prompt 预算裁剪中将 `M:tasks`/`M:intents` 从最高优先移除项下调，保留最小索引快照。
  - 对 `delete_intent/cancel_task` 增加“按标题/最近活跃对象”匹配能力（唯一命中直接执行，多命中再澄清）。
- 验收：用户无需先手动提供 ID 即可完成常见状态查询与删除/取消操作。

## 建议排期顺序
1. 先修 P0-1（用户可见故障）。
2. 再修 P0-2（策略误伤导致任务不可执行）。
3. 修 P1-9（`intent/task` 可见性缺口，属于能力底座）。
4. 修 P1-6（quote 语义增强）与 P1-8（上下文切换顺序）。
5. 修 P1-3 与 P1-7（重试熔断 + 任务去重）。
6. 最后修 P1-4（预算治理，需结合前述治理后再调参）。
