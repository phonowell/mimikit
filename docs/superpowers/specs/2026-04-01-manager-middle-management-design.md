# Manager 中层化设计

## 目标

- 把 manager 从“轻量调度器”收敛为“承担推进责任的编排中层”。
- 让用户离线后，manager 默认继续推进并做常规判断；只有真正越界的例外才上提。
- 保持当前产品边界：manager 不直接执行，执行面继续外放给 worker / 外部运行时。

## 问题定义

- 当前 manager 更擅长“合法编排”，不够擅长“替用户盯事”。
- 用户仍需自己读 `task_result`、追下一步、判断是否续跑、区分普通卡点与需要拍板的例外。
- 这使系统更像低上下文调度器，而不像能减轻离线管理负担的中层。

## 新目标与非目标

### 新目标

- 向上管理：manager 主动输出阶段结论、当前风险、是否需要用户决策。
- 向下管理：manager 主动续派、改派、停下、补证据、等待，不把 worker 建议原样甩回给用户。
- 离线推进：在既有目标、任务合同与门禁内，manager 默认继续推进并做常规判断。
- 例外上提：只把真正需要高层决策的问题抬回给用户。

### 非目标

- 不把 manager 做成直接执行者。
- 不新增第二套调度系统、状态总线或长期过程态。
- 不新增宽泛的“中层对象”“审批对象”“督办对象”等抽象壳。
- 不保留新旧协议兼容层；新规则直接替换旧默认行为。

## 硬边界

- 文件系统仍是唯一真相源。
- `task / plan / focus / memory` 继续严格分层。
- manager 只保留目标、计划、当前状态、验收门禁与必要的压缩结果。
- `memory` 不吸收过程态；`focus` 不变成任务板。
- 高风险 action 仍要求当前用户输入直接支撑。
- 自动写回仍只允许落在 `task状态`、`plan进度`、`archive`、`focus`。
- manager 只能在既有目标、任务合同、验收门禁内做常规判断；需要改写 `用户目标` 或 `验收标准` 时必须上提。

## 责任模型

### 1. 向上管理

- 默认给用户高信号压缩，而不是原始过程。
- 输出结构收敛为三类信息：
  - 阶段结论：现在到了哪一步，结果是否可接受。
  - 当前风险：什么在阻塞，风险级别是什么。
  - 决策需求：是否需要用户拍板；若需要，缺什么输入。
- 用户不应先读 `task_result`、archive 或 worker 原文，才能理解系统状态。

### 2. 向下管理

- manager 对以下动作负责：
  - 派单：创建新任务或持续计划。
  - 续跑：同目标低风险延续时，默认继续。
  - 纠偏：结果偏航时改派、缩 scope、补证据或停下。
  - 收口：证据充分时宣布 done/failed；证据不足时停在 handoff。
- worker 只负责局部执行与压缩回传，不负责决定全局推进策略。

### 3. 过程治理

- “继续推进”成为默认，而不是“等用户催”。
- manager 应优先复用既有 `task / plan / focus` 完成推进，不新增流程对象。
- plan 只承载持续触发外壳，不承载新的审批语义。

### 4. 例外上提

- 只允许以下场景上提：
  - 高风险动作
  - 需要改写 `用户目标`
  - 需要改写 `验收标准`
  - 证据冲突或不足，manager 无法在当前合同内判定
  - 连续纠偏失败超出预算
- 其余场景默认由 manager 自行消化并推进。

## 运行模型

### 默认续跑规则

- 当本轮只有 `task_result` 且没有新的用户输入时：
  - 若结果显示目标已完成且证据充分，manager 收口。
  - 若结果显示同一 `focus`、同一任务合同方向上仍有明确低风险下一步，manager 默认续派或续跑。
  - 若结果显示需要补证据、缩 scope、重试或等待，manager 默认自行选择常规治理动作。
  - 若结果跨出当前目标或验收门禁，停在 handoff 并上提。
- 对“已存在单一清晰续跑锚点，却只输出建议文本不产出 action”的情况，运行时要补一层硬校验：直接打回 correction，要求 manager 改为具体 action 或明确例外停下；清晰锚点至少包括“单一匹配的 active plan”或“result task 自身给出的单条结构化 `handoff.nextSteps[]`”，不能只靠 prompt 自觉。

### 常规判断的范围

- 可由 manager 默认判断：
  - 是否继续当前目标
  - 是否缩小范围重试
  - 是否要求 worker 补证据
  - 是否把持续推进改为 `plan`
  - 是否在证据不足时停止并整理 handoff
- 不可由 manager 默认判断：
  - 改写用户目标
  - 放宽验收标准
  - 高风险写操作的越权推进
  - 把一次性安排升格为长期规则

## 状态与协议收敛

- 第一阶段不新增 action 类型。
- 继续复用既有 `enqueue_task`、`task_control`、`set_plan`、`delete_plan`、`assign_focus`、`remember_*`。
- 第一阶段不新增中间状态对象；只调整 manager 对现有 `task_result`、`plan`、`focus`、`archive` 的解释与决策。
- manager turn 顶层补一个最小结构化 `decision` 字段，用于声明 `continue | handoff | escalate` 及受限 `reason`；它只是本轮输出协议的一部分，不是新的状态对象或过程总线。
- `decision` 只在当前批次已有匹配的结构化结果/反馈证据时生效；不能把它做成“空动作也能过关”的自由逃生口。
- worker 回传协议继续收敛为结论、证据路径、提交 hash、验证结果、handoff；禁止回灌大段原始上下文。

## Prompt 改造

### `prompts/manager/system.md`

- 身份从“主 agent 编排层”明确强化为“承担推进责任的编排中层”。
- 增加硬要求：
  - 默认继续推进并做常规判断
  - 不把 worker 建议原样退回给用户
  - 向上只汇报高信号结论、风险与决策点
  - 只在例外场景上提

### `prompts/manager/action-surface.md`

- 强化 `enqueue_task` / `set_plan` / `task_control` 的管理语义：
  - 续跑优先于重复新建
  - 同目标低风险延续优先由 manager 自行消化
  - 结果后的常规治理默认落在现有 action 内

### `prompts/manager/action-feedback*.md`

- guard 拒绝时，不让 manager 退化为空泛澄清。
- 应明确告诉 manager：当前缺的是哪类证据、可否在当前合同内补齐、是否需要上提。

### `prompts/manager/fallback-reply*.md`

- fallback 也必须维持“中层口径”：
  - 给阶段结论
  - 给 stop reason 或 risk
  - 给是否需要用户决策
- 不回显原始输入，不转储 worker 原文。

## 运行时改造

### 第一阶段：责任重写，不扩协议

- 改 manager prompt、result follow-up、intent-evidence 判断与 reply 生成。
- 目标是先让 manager 的默认行为变成“自己接住常规推进”。
- 不新增 action；不新增状态对象；不加兼容层。
- 唯一新增的结构化位是 turn 顶层 `decision`，用于让 runtime 无歧义地区分“空动作偷懒”与“明确 handoff / escalate”。

### 第二阶段：强化 `task_result -> next action` 判断

- 在 manager 结果处理路径里显式区分：
  - 收口
  - 低风险续跑
  - 常规纠偏
  - handoff 上提
- 判断依据只允许来自：
  - 当前用户目标
  - 当前 focus
  - 当前任务合同 digest
  - 当前 task_result / archive / handoff
  - 现有风险门禁

### 第三阶段：补用户可见解释层

- reply 默认压缩为：
  - 现在进展
  - 正在做什么
  - 为什么没打扰你
  - 什么时候必须打扰你
- 目标不是更长，而是更像中层汇报。

## 明确不做

- 不引入新的管理实体或配置矩阵。
- 不新增“manager review lane”“approval queue”“supervisor bus”之类壳层。
- 不让 `memory` 承担推进状态。
- 不让 `focus.summary/openItems` 恢复为任务板。
- 不做基于关键词的“中层感”伪判断。

## 最小落地顺序

1. 先改 `AGENTS.md`、manager prompt 与相关文档，固化新目标和硬边界。
2. 再改 manager `task_result` follow-up 决策，让结果回合默认支持低风险续跑与常规纠偏。
3. 最后补用户可见解释层与最小必要测试。

## 验收标准

- 用户离线后，manager 在常规场景下能继续推进，而不是停在“建议下一步”。
- 用户不需要频繁自己读 worker 结果、决定是否续跑或催下一步。
- manager 仍不直接执行，不放宽高风险门禁，不污染 `memory` / `focus` 分层。
- 方案不新增兼容层、不新增第二套调度系统、不引入脆弱关键词逻辑。
