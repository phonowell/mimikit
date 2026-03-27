# 异步自治作业系统架构

> 返回 [系统设计总览](../README.md)

## 文档边界

- 本文档只描述无人在线时段自治作业的最小必要架构：异步触发、单回路编排、外部执行、持久化恢复、人返回后的复盘与续跑。
- Task/Action/Plan/Focus/Memory 的具体协议仍以 `../workflow/task.md`、`../workflow/action.md`、`../workflow/plan.md`、`../workflow/focus.md`、`../workflow/memory.md` 为准。

## 架构边界

- 保留统一模型 `Task + TaskPlan + Focus`，不再维护旧链路兼容层。
- `mimikit` 对外是异步自治作业系统，对内保持轻量编排内核：负责本地状态机、队列、调度、可观测性，不直接执行任务。
- manager 使用 `openai-responses`；worker 使用 `codex-sdk`。
- 运行时状态采用“根级实体集合 + 过程态子域”结构：根上保留 `queues / tasks / taskPlans / focuses`，过程态收敛在 `session / manager / worker / ui`，避免继续堆第二套调度或摘要层。
- manager prompt 收敛为双 packet：`state_packet` 负责稳定状态（focus/task/plan），`event_packet` 负责当前批次事件（input/result/history/action_feedback/environment/packet）；详细 task result 只留在 `event_packet.batch_results`，`state_packet.tasks` 不再重复展开结果正文；section 字节预算固定取自 `manager.promptSections`，`wakeProfile` 只影响 packet section 选择，不再动态改写 bytes，也不再分档 action surface。
- worker 执行通道固定为 codex，不再进行 provider 候选注入、自动打分或按任务显式切换。
- manager/worker 每轮 usage 统一写入 `usage/ledger.jsonl`，直接暴露 prompt 字节、packet 裁剪与执行侧 token 消耗，不再额外引入成本推导层。
- HTTP 输入校验与参数归一化集中在 `src/surface/http/helpers.ts`。
- 本地持久化采用进程内串行 + 文件锁（`proper-lockfile`）。

## 组件职责

- `manager`：消费 `inputs/results`，决定回复、任务、计划与收尾策略，记录每轮 context packet 与 usage ledger，并在批次收尾后触发 memory refresh。
- `worker`：把任务派发给外部执行运行时，并把结果回写到本地状态，同时在结果收尾时写 usage ledger。
- `managerLoop`：统一处理计划触发、待确认 choice 生命周期、worker 槽位释放，不再保留独立 trigger loop。
- `runtime reaper`：主进程异常退出后回收 worker 子进程。
- `channel lifecycle`：启动并维护 Telegram polling，把外部入站消息转成统一输入，并负责被动回发与跨通道广播。
- HTTP/WebUI：承担观察、复盘、显式续跑与控制面入口（消息删除、任务变更、choice 选择、restart/reset），不承载调度策略。

约束：

- manager 回合使用 `maxCorrectionRounds` 硬上限，超过后写入 `manager_round_limit` 并返回 best-effort 文本。
- 当补充检索没有新进展时，manager 直接降级为澄清答复，不再掉进 `manager_end status=error`。
- 当同类 `action_execution_rejected` 在同一批次内重复出现时，manager 按动作类别给出替代路径并停止继续重试。
- worker 不再维护仓内 run budget 或多轮续跑；单次 dispatch 只做一次 provider 调用，是否再次 `resume` 交由通用任务控制。

## 启动顺序

进程入口：

- `src/bootstrap/cli/index.ts`
- `src/kernel/orchestrator/orchestrator-service.ts`
- `src/kernel/orchestrator/orchestrator-runtime-lifecycle.ts`
- `src/kernel/orchestrator/orchestrator-channel-lifecycle.ts`

启动顺序：

1. CLI 解析参数，加载 `config.toml` + 环境变量覆写，并获取 runtime lock。
2. 启动 `runtime reaper` heartbeat，建立外部子进程桥接。
3. 构造 `Orchestrator` 并执行内部启动链路：
4. `hydrateRuntimeState`
5. `ensureGlobalFocus` + `enforceActiveFocusLimit` + `pruneArchivedFocuses`
6. 写入 startup system message（`Session started.`）
7. `enqueuePendingWorkerTasks` + `notifyWorkerLoop`
8. 启动 `managerLoop` 与 `workerLoop`
9. 启动 Telegram channel lifecycle（若启用）
10. 启动 HTTP 服务与 WebUI 静态资源（若启用）

## 主链路（信号驱动 + deadline 唤醒）

1. 用户输入（WebUI/Telegram）、计划触发、worker 结果先写入本地队列；写入后通过 `notifyManagerLoop` 立即唤醒 manager。
2. `managerLoop` 基于队列 checkpoint 增量消费这些输入并执行编排，不再每轮全量重读 `inputs/results` JSONL。
3. 若产生任务，worker 调用外部运行时执行并写回 `results/packets.jsonl`。
4. manager 再次被唤醒，直到本轮走到明确收尾条件；若当前无新队列事件，则只按最近 `plan scheduled_at|cron` 的 deadline 休眠，不做固定频率空轮询。

明确收尾条件只有三类：

- `task_completed status=succeeded`：任务完成并归档。
- `task_completed status=failed`：本轮执行失败或缺失完成协议，等待后续人工判断是否再次 `resume`。
- manager best-effort 收敛：输入不足、守卫拒绝或检索无进展时直接给出下一步，不再空转。

实时唤醒来源：`user_input`、`task_result`、`trigger_fire`、`worker_slot_freed`。

说明：

- `worker_slot_freed` 不依赖独立轮询器；它由 worker 生命周期信号驱动 manager 重新评估可用槽位。
- `cron` / `scheduled_at` / `choice timeout` 仍属于时间触发，但只在最近 deadline 到达时唤醒，不再以 1 秒间隔扫全局状态。
- system event 在 `inputs/history` 中以 `text(summary) + systemEventName + systemEventPayload` 持久化；控制面判断不再依赖 `text` 中的协议标签。

## 一致性与恢复

- manager loop 单飞，同一时刻只允许一个活跃批次。
- 队列 compact 只在“已完全消费且达到阈值”时执行。
- 上下文连续性依赖 `history + tasks + plans + focus + manager context packet + usage totals` 落盘，而不是再造独立记忆总线。
- `restart/reset` 先回包，再等待 in-flight manager 批次收敛后持久化退出。
- 进程被杀（如 `SIGKILL`）时由 `runtime reaper` 基于 `.mimikit/runtime/lease.json` 与 `.mimikit/runtime/children.json` 执行回收。

## 细节索引

- runner/provider 执行细节：`./runners.md`
- 任务协议与状态流转：`../workflow/task-and-action.md`
- HTTP 与状态目录规范：`../workflow/interfaces-and-state.md`
