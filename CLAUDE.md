# MIMIKIT

## 项目概览

- 目标：构建单 session、多重心、自然交互的 AI 项目推进主管，默认在用户离线时继续推进项目组合，防止漂移、串线与假忙，确保对结果负责。
- 定位：保留必要上下文以理解意图并推动结果，同时以浸入式自然交互方式与用户协作；主线程不直接承担大段执行，而是做低上下文的状态治理与推进判断。
- 特点：长期自治、尽量少打扰，对内保持多工作线隔离、聚焦纠偏与验收，确保每条线都有清晰 handoff 与续跑路径。

## 目标收敛

- 长期目标：做“极简版、特化的主 agent 编排中层”，而不是通用 agent 平台。
- 主 agent 只保留高价值上下文：目标、计划、当前状态、验收门禁；默认不直接承担大段搜索、实现、细读、批量改写，但必须对推进结果负责。
- manager 默认承担向上与向下管理：向上输出阶段结论、风险与决策点；向下负责派单、续跑、纠偏、停下与收口建议。
- subagent 是默认局部执行面：搜索、实现、局部修复、文档细读、测试排查优先委派给 subagent；主线程只接收压缩后的结论、工件与提交结果。
- 文件系统是主状态层：任务、计划、证据、handoff、总结、长期记忆都应落盘并可追溯；消息历史只保留高信号摘要，不承担长期真相源职责。
- 空闲生命周期默认服务主链路推进：允许在 idle 窗口执行记忆刷新、归档整理、历史压缩、低优先级总结；若显式验收门禁通过，可有限自动写回 `task状态`、`plan进度`、`archive`、`focus`；不得越权改写 `用户目标`、`验收标准`、`memory`。
- cron / memory / idle hook 都只能服务主链路收敛，禁止长成第二套调度系统、过程状态总线或隐式代理层。

## 项目目标边界

### 我们是什么

- 单 session、多重心、自然交互的 AI 项目推进主管。
- 以编排中层承担推进责任：理解意图、编排任务、持续判断与收口，不直接执行主要任务。
- 默认长期自主推进、尽量少打扰用户，降低跨天/跨周跟进成本。
- 文件系统是主状态层，WebUI 是用户可见的操作与复盘界面。

### 我们不是什么

- 不是通用 agent 平台，也不是第二套长期膨胀的基础设施层。
- 不是直接执行所有任务的超级主 agent；主线程不承载大段搜索、实现、细读、批量改写。
- 不是把多重心复杂度转嫁给用户的任务板或流程系统。
- 不是把日常续跑、补证据、读结果、催下一步这些管理成本退回给用户的被动调度器。
- 不是由消息历史承载真相源的聊天机器人；消息只保留高信号摘要。


### 我们要做什么

- 收敛为承担推进责任的编排中层，只保留目标、计划、当前状态与验收门禁，主动推动项目组合的连续前进，而不是把责任退回给用户。
- 默认把搜索、实现、排查、细读等局部工作委派给 subagent 或外部运行时，只接收压缩后的结论与工件。
- 让 manager 基于 `focus` 归属与任务合同持续推进多条工作线，并进行常规纠偏；只有在高风险、证据不足、目标冲突或多次纠偏失败时才上提。
- 让任务、计划、证据、handoff、总结、长期记忆落盘并可追溯，状态服务于推进而非暴露复杂性。

### 我们不做什么

- 不把 manager 做成直接执行者，不让主线程重新承担搜索、实现、细读或批量改写。
- 不把 `focus` 做成任务板，不让 `summary/openItems` 承载执行步骤、验收标准或恢复指令。
- 不把内部结构大面积暴露给用户或要求其理解多重心细节。
- 不让长期记忆吸收过程态、当前进度或待办；`memory` 只保留稳定事实、偏好与约束。
- 不用脆弱证据要求长期阻断推进；证据不足时停在 handoff，不伪完成或低置信度收口。

## 经确认的硬边界（2026-04-01）

- 若本文旧表述与本节冲突，以本节为准。
- 文件系统是唯一真相源；消息历史、UI 展示与运行日志都不是最终真相源。
- 主 agent 只负责目标理解、计划编排、常规推进判断、状态治理、验收门禁与例外上提，不直接承担具体执行。
- 所有具体工作默认外放给 subagent 或外部运行时；主线程保持低上下文，只保留目标、计划、当前状态与验收门禁。
- WebUI 是友好展示层，也是用户在线时可直接操作的界面；它展示和修改的都应回写到文件系统真相源。
- manager 默认工作模式是“继续推进并做常规判断”；证据充分时优先续跑、改派、停下或收口，不得把已可执行事项退回成多余追问。
- manager 的向上管理输出必须压缩为阶段结论、当前风险、是否需要用户决策；不得要求用户先读原始 `task_result` 或 worker 原文才能继续。
- manager 的向下管理只能通过既有 `task / plan / focus / action` 边界完成；不得新增第二套隐式流程总线、过程态对象或调度层。
- 若 `task_result` 在现有目标、`focus`、任务合同与验收门禁内给出明确下一步，manager 可默认继续同目标的低风险后续任务；若会越过高风险门禁，或需要改写 `用户目标` / `验收标准`，必须上提。
- `task` 表示要完成什么，`plan` 表示如何推进，`focus` 只表示当前关注点摘要，`memory` 只表示长期稳定事实、偏好与约束。
- `task / plan / focus / memory` 必须严格分层；任何实现都不得把其中一个偷渡成另一个的承载层。
- `focus` 不是任务板；`summary/openItems` 不得承载执行步骤、验收标准或恢复指令。
- `memory` 只允许保存长期稳定内容；短期进度、过程态、待办、临时判断不得进入 `memory`。
- manager guard 必须按风险分级工作：高风险 action 需要当前用户输入直接支撑，不能退化为字面卡死所有动作。
- 例外上提只允许由以下场景触发：高风险动作、需要改写 `用户目标`、需要改写 `验收标准`、证据冲突或不足、连续纠偏失败超出预算。
- subagent 回传必须收敛为压缩结果：结论、证据路径、提交 hash、验证结果；禁止把大段原始上下文回灌主线程。
- 离线推进不只允许产出工件，也允许在门禁通过后推进主状态；但自动写回只能落在 `task状态`、`plan进度`、`archive`、`focus`。
- 离线自动化绝不允许改写 `用户目标`、`验收标准`、`memory`；这些只能由更高层显式决策更新。
- 只有主 agent 能宣布 `task.done` / `task.failed` 一类收口状态；subagent 只能提交证据、结果与 handoff。
- 证据不足时，系统必须停在 handoff 或待续跑态，不得因为想“继续推进”而低置信度收口。
- 当前仓库写任务默认必须走 `use_worktree=true`，统一进入 review / merge / cleanup 闭环。
- manager 默认粗粒度派单；只有在目录边界独立且互不冲突时才允许并发多个 `enqueue_task`。
- prompt 层必须强化上述推进责任与上提边界，但 prompt 不是能力替代层；行为变化必须有对应状态、guard 与调度路径支撑。
- 新功能默认先拒绝；只有在 ROI 明确高、边界更硬或复杂度更低时才允许进入主线。

## 我们的缺口是什么

- 当前真实业务主线缺口：manager 仍更像轻量调度器，向上汇报、向下管理与离线常规判断不足，用户仍需承担较高跟进成本；下一阶段主线目标是把 manager 收敛为“承担推进责任的编排中层”。
- 已闭环的上一轮缺口：`plan.runtime` 分层、`focus` digest 硬边界、`Task.git.lifecycle` 入模、后台任务注册/写域治理、manager 默认 surface 去掉 `lookup`、worker 完成改为 `M:task_handoff + M:skill_usage status="done"` 协议、`mutate_task` 显式写回 `review_passed|merged|cleaned`、git 闭环写回的 intent-evidence 门禁与 archive/handoff 同步，均已落地。
- 基于 2026-03-23 对 `.agents` 全量 skill（`code-deduplication`、`context-engineering-collection`、`book-sft-pipeline`、`digital-brain`、`reasoning-trace-optimizer`、`comprehensive-research-agent`、`advanced-evaluation`、`bdi-mental-states`、`context-compression`、`context-degradation`、`context-fundamentals`、`context-optimization`、`evaluation`、`filesystem-context`、`hosted-agents`、`memory-systems`、`multi-agent-patterns`、`project-development`、`tool-design`、`skill-template`、`prompt-engineering-patterns`、`workflow-orchestration-patterns`）与真实代码的再次核验，当前实现未发现新的主线目标偏离；以下收敛项已由代码确认：
- `manager` prompt/action surface 文案已迁入 `prompts/manager/action-surface.md`，不再把会注入 LLM 的自然语言说明硬编码在 TS。
- `M:state_packet.tasks` / `M:state_packet.plans` 已收缩为编排态信息，不再携带 `task.prompt`、`task_prompt` 或完整 task contract。
- manager `query_context` / `read_file` dormant lane 已从代码协议、packet/digest、schema、文档和测试中删除，主线程不再保留默认不可达的 lookup 旁路。
- `memory_refresh` 已改为只由结构化 `memory_remembered` 信号触发与取样，运行态/快照检查点切为 `signalVersion + lastProcessedSignalVersion`，不再采样最近用户原文。
- manager memory ranking 已停止消费 `task.result.output` / `plan.title` 一类过程态文本；`remember_memory` 现要求单行稳定 digest，并在 validation 阶段拒绝 checklist、多行过程文本、协议标签与 runtime 引用。
- 与 lookup 移除相关的 fallback/evidence 提示词、`score-runtime-window` 预算键集和回归测试已同步到当前协议，不再残留旧的只读 lookup 指引或过期 `file/query lookup` 配额字段。
- manager prompt 已彻底删除 `history_lookup` section / budget / type 壳；worker `task_result` 也不再通过 `handoff.goal` 把 `task.prompt` 回灌主线程。
- manager 空文本回退已收窄为“稳定模板”或“task handoff 摘要 + 任务归档链接”；不再回显用户输入，也不再把 `task.result.output` 原文直接吐给用户。
- WebUI / read-model 的 task 标题已收紧为 `task.title || task.id`；即使遇到脏旧数据，也不再从 `task.prompt` 派生展示标题。
- `.agents` skill 与当前项目目标的关系已核验：
- 直接支撑主线收敛：`context-fundamentals`、`context-degradation`、`context-optimization`、`filesystem-context`、`multi-agent-patterns`、`tool-design`、`project-development`、`code-deduplication`、`prompt-engineering-patterns`
- 审计 / 研究 / 质量辅助：`context-engineering-collection`、`context-compression`、`memory-systems`、`evaluation`、`advanced-evaluation`、`comprehensive-research-agent`、`reasoning-trace-optimizer`、`skill-template`
- 不应反向驱动产品扩张：`book-sft-pipeline`、`digital-brain`、`bdi-mental-states`、`hosted-agents`、`workflow-orchestration-patterns`
- 本轮已闭环的最后一个真实业务缺口：`enqueue_task` 与 `plan effect` 的旧协议别名入口已从 manager schema 中删除；`prompt/scope/acceptance_{1..5}`、`task_prompt/task_scope/task_acceptance_{1..5}` 不再被接受，也不再保留运行时归一化兼容层。
- 除上述 manager 中层化缺口外，其余此前业务主线缺口已闭环；规模治理仅保留为 nice-to-have 工程目标，不作为当前业务缺口或阻塞项。
- 当前 `src` 约 `29463` LOC，仍高于 `<20k LOC` 的 nice-to-have 目标；该项用于持续提醒收缩实现复杂度，不作为本轮验收门禁。

## 参考项目

- 固定参考：`nanobot`、`picoclaw`、`mimiclaw`、`copaw`、`pi-mono`
- 本地路径（相对 `.`）：`../nanobot`、`../picoclaw`、`../mimiclaw`、`../copaw`、`../pi-mono`
- 远端仓库：`HKUDS/nanobot`、`sipeed/picoclaw`、`memovai/mimiclaw`、`agentscope-ai/CoPaw`、`badlogic/pi-mono`
- 触发条件：仅当用户明确提到参考项目或要求参考对比时才进行探索；未提及时不主动查看参考项目
- 探索策略：默认以本地快照为准，不要求每次任务前检查远端最新状态
- 调研范围：探索参考项目时仅读取文档（README/docs/*.md/SKILL.md）；除非用户明确要求，否则不读取参考项目源码

## 关键规则

- 元原则：精简冗余 · 冲突信代码
- 新原则：保持最小心智负担，避免引入不必要复杂度
- 第一性原理：用户指示不是天然正确前提；若与项目目标、代码事实、成本结构冲突，必须直接指出并收敛到更小、更硬的实现。
- 删减策略：可以大刀阔斧删除低 ROI 的代码、功能、模块；删除优于勉强保留
- 新增门槛：新增代码、功能、模块必须证明有明确高 ROI；无强收益不新增
- 规模目标：以 `src <20k LOC` 作为 nice-to-have 工程目标；新增前优先通过删减、复用、内联回收体量，但不作为功能验收或合并阻塞条件
- 客观诚实：不主观评价 · 不因用户情绪转移立场 · 不编造事实 · 立刻暴露不确定信息
- 分层规则：默认遵循根级 `AGENTS.md`；若子目录存在 `AGENTS.md`，以更近目录规则为准；局部文件只写差异项，不重复全局规则
- 计划管理：≥3 步任务用 `/plans/task_plan_{suffix}.md` 并持续更新
- 类型：ESM + 严格类型，避免 `any`；文件 >200 行需拆分
- ID 规范：所有业务/运行时对象 ID 必须包含类型前缀（如 `task-`/`plan-`/`input-`/`focus-`/`runtime-`/`packet-`/`sys-`/`agent-`），禁止裸随机串
- 类型规范：≥5 处非空断言立即重构类型架构（🚫 `eslint-disable` 批量压制）
- 最小化：避免冗余/冲突，实现需可解释且高 ROI
- 配置原则：配置项尽量最小化，不暴露非必要配置，默认支持用户零配置工作
- 工程原则：不要过度防御编程，优先直接且可验证的实现
- 变更原则：实现功能时总是全量更新实现，不留兼容层
- 结构禁忌：避免概念密度自增；新增概念前先证明不能靠内联、合并职责或复用现有类型解决
- 壳模块禁忌：单调用点搬家式拆分默认禁止；仅当形成稳定边界、复用面或显著降低主路径复杂度时才允许独立成文件
- 命名禁忌：禁止用 `*-ops`/`*-helpers`/`*-facade`/`*-lifecycle` 等大词掩盖职责混装；命名必须对应单一明确职责
- 主类禁忌：主类/服务类不得长期充当总路由器或纯代理层；若方法多数只转发 `runtime`，应继续下沉或收缩公开面
- 横切概念禁忌：`focus`/`memory`/`signal`/`trigger` 一类横切概念必须严格控重，禁止同时承载状态归属、调度策略、摘要提炼、UI 通知等多重语义
- 主线程约束：默认保持低上下文、高响应；能委派给 subagent 的搜索、实现、排查、总结任务，不应堆回主线程。
- manager 责任：默认继续推进并做常规判断；不要把日常续跑、补证据、读结果、催下一步这些职责退回给用户。
- 多重心排序原则：`workingFocusIds` 不能只看“最新一个”用户/结果信号；同批次触达的多个 workline 必须保序纳入，且在无新用户输入的自治轮里，应优先可推进的 `plan.runtime.stage(needsDecision=false)`，不要让陈旧 open task 抢占主工作线。
- 例外上提：只在高风险、目标/验收标准变更、证据不足或冲突、连续纠偏失败超预算时上提；其余场景默认由 manager 自行消化并推进。
- subagent 回传约束：只回传压缩后的结论、证据路径、提交 hash、验证结果；禁止把大段原始上下文回灌主线程。
- Prompt 规范：面向 LLM 的提示词禁止硬编码在 TS/JS 中；统一放在 `prompts/` 并通过构建器注入
- Prompt 责任：prompt 只强化 manager 的推进责任、向上/向下管理方式与例外边界；禁止靠 prompt 文案伪造第二套能力或兼容层。
- 禁止词表驱动功能实现：任何核心能力不得依赖关键词列表硬编码判定；必须使用可泛化、可验证的机制（结构化信号/模型判别/规则引擎）
- 词表驱动补充约束：高风险授权、write lane 变更、对象归属判定不得再靠“同义词/别名短语命中”放行；允许依赖的只有结构化字段和值、对象 ID/路径精确锚点、runtime provenance 与状态归属，不能靠 `写入/只读/用 worktree` 一类短语列表兜底
- 协议设计禁忌：不要把 LLM 当成精确协议填表器；凡是要求模型稳定回填精确子串、字面锚点、隐藏派生字段或严格逐字 provenance 的协议，默认视为脆弱设计，除非 runtime 可代填、可校正或可安全降级。
- Guard 设计原则：guard 的目标是约束越权与保留可追溯性，不是放大模型微小格式波动；高风险动作可以 fail-closed，低风险或附属动作默认应 fail-soft，不得因附属写入失败污染主回复。
- Action 设计原则：优先 `state-first`，禁止 `protocol-first`；不要把同一个编排判断同时塞进 prompt、schema、guard、follow-up repair 和额外 stop 字段。若 runtime state 已足够判定低风险 continuation / handoff，就不要再新增平行协议位让模型重复声明。
- Write lane 原则：`cwd`、`resourceMode`、`useWorktree` 共同构成写任务的执行 lane；延续/更新现有 write 对象时，同 lane 改写可按对象授权处理，改 lane 则必须从当前用户输入中看到对新 lane 的显式授权，不能靠对象点名或合同 overlap 顺带放行。
- Write lane 显式授权细化：`cwd` 可接受路径精确锚点；`resourceMode` / `useWorktree` 只接受结构化字段和值的显式授权，不接受自然语言别名、提示词文案或回复层改写后的短语作为放行依据。
- 显式锚点约束：`source_quote` 与其他显式 anchor 只应作为审计信息，不应成为唯一通行证；显式锚点不匹配时，优先回退到现有上下文、结构化状态或其他可验证证据，而不是直接把本可继续的主链判死。
- Provenance 约束：需要来源可追溯时，优先记录 runtime 可验证来源（当前输入 ID、结果 ID、focus/task/plan 归属、持久化 ref）；避免要求模型生成“必须逐字命中”的引用值作为唯一 provenance 载体。
- 弱信号约束：`cwd`、`resourceMode`、`useWorktree`、`lastTaskId`、单一 active object、plan/task 标题命中，都只允许用于缩小候选集或提供审计线索；除非再叠加语义一致与对象归属一致，否则不得直接放行动作。
- 授权分层原则：证据与 guard 的职责是处理高风险越权和高歧义裁决，不是替代自然语义理解；低风险 continuation / follow-up / stage 写回默认依赖“语义一致 + 归属一致 + runtime provenance”判定，避免在主链前再套一层脆弱协议。
- 失败降级原则：辅助动作、记忆写入、档案写入、摘要写回一类非主链动作失败时，优先 suppress、丢弃或停在内部反馈；只有会改变用户目标、验收标准、任务执行或高风险副作用的失败，才允许升级为用户可见阻塞。
- Runtime 续跑原则：若 runtime 已基于 active plan、触发器或结构化状态拥有明确续跑路径，不要再额外要求模型显式复述同一 `enqueue_task`/`set_plan` 才能继续；manager 负责判断是否继续，不负责重复输出 runtime 已能决定的脚手架。
- 用户可见回复约束：内部 action 名、schema 字段名、guard 名、修复回合提示默认不得直接泄漏到用户回复；面向用户只输出阶段结论、当前风险与还缺的最小输入。
- Intent-evidence 原则：优先使用结构化锚点、对象归属、focus/task/plan 关系与 runtime 状态判定是否可继续；字面子串命中、低阈值词面 overlap 只能作为弱辅助，不得成为核心通行机制。
- Worker 协议原则：worker 输出中真正决定主链推进的最小字段才允许 hard-required；`handoff`、evidence、artifacts、归档引用一类附属结果应允许 runtime 补齐、归一化或留空，不得因为附属结构缺失就把整轮执行判成协议失败。
- try/catch 谨慎：避免吞错；暴露错误优于静默失败
- idle 维护约束：记忆压缩、问题总结、归档整理等后台任务默认只产出派生工件；只有显式验收门禁通过时，才允许有限写回 `task状态`、`plan进度`、`archive`、`focus`，且不得改写 `用户目标`、`验收标准`、`memory`。
- 测试策略：仅补充能覆盖真实风险/回归点的最小必要用例，不滥加；尤其 `webui`/`telegram` 层禁止添加低价值、易变测试用例
- 测试反模式（禁止新增）：同一函数同一路径的重复断言（如仅换文案字面量）；纯字符串映射/normalize 薄测试（无状态转换、无分支风险）；强耦合厂商命名/UA 版本/提示词文案的脆弱断言
- 测试反模式补充（禁止新增）：围绕 prompt/reply/hint 的大段 `toContain`/`not.toContain` 铺陈式断言；把同一用户可见文案拆成多条字面量检查；仅验证措辞润色、标签翻译或内部术语替换而不验证状态变化、结构契约或泄漏类别
- 测试替代策略：优先覆盖跨模块行为与稳定契约（输入→状态变化→输出）；一个主路径 + 一个关键回退分支即可，避免为次级回退链路逐层加测试
- 测试替代策略补充：prompt/reply/hint 优先验证结构边界与泄漏约束，例如 action 集合、字段/标签是否暴露、输出 contract、对象归属、状态写回；只有文案本身就是产品契约时，才允许校验最小必要字面量
- 测试合并规则：若新用例仅验证已被更高层测试覆盖的同一语义，直接并入现有测试或删除旧低 ROI 用例，不并存
- 执行 `pnpm lint` 大胆用，不要担心会带来的代码变更
- 编码统一：Windows 环境读写均按 UTF-8 处理

## 当前系统环境注意事项（经验教训）

- `2026-04-08` 证据系统/续跑判定惨痛教训：
  - 为修补“协议过严、经常误拦”，曾引入大量 fallback、显式锚点、唯一对象捷径和 shape-based continuation；结果同时制造两类故障：该继续的主链被误拦，不该继续的无关主线被误放。
  - 这不是单点实现疏漏，而是授权模型错位：对脆弱格式信号过严，对弱结构信号过宽；同类问题已在 continuation、follow-up、set_plan、resume、cancel、plan 绑定、plan 写回多处复现。
  - 后续涉及 intent-evidence / continuation / follow-up / plan ownership 的设计，默认先问“这层 guard 是否真的必要”；若只是为低风险主链补协议，不如直接删掉。
  - 严禁再把 `cwd`/`resourceMode`/`useWorktree`/`lastTaskId`/唯一 active object 当作直接授权条件；它们最多只能帮助定位候选对象。
  - 需要可追溯时优先让 runtime 记录 provenance；不要再逼模型生产脆弱锚点来换取“可继续执行”的资格。
  - 若一个证据机制长期造成误拦、误放、维护负担高于收益，应优先删除或收缩，而不是继续堆补丁修补它。
- `2026-04-13` action 设计继续偏移的教训：
  - action 授权的最小模型只能是：结构合法、runtime 状态合法、风险门禁通过；不要再叠第四层“模型自证自己在延续同一条线”。
  - 不要为“可审计”“可区分 handoff”再补顶层 `decision` 一类平行协议位；`reply + actions + runtime state` 已能表达的编排判断，不得再复制一份给模型填写。
  - 不要把 result-only follow-up 做成专门的修复陷阱；reply-only 停下本身不是错误，高风险越权才是错误。
  - intent-evidence 只该拦高风险动作；read continuation、resume、低风险 plan/task 延续不应再做词面重叠授权。
  - 若某条规则的主要作用是逼模型“补协议形状”而不是降低真实风险，应直接删除。
  - `continuation_of` 一类 continuation 锚点若不进入 runtime 真状态，就不该存在于 action 合同里；纯靠模型回填的“我是在延续这条线”不是可靠状态。
  - “replacement-cancel”“resume-existing”这类 validation 预判，本质是在替 runtime 重复做状态决策；若 apply/runtime 已能基于 fingerprint 和状态机处理，应删除 validation 旁路。
  - 若 runtime 已能依据 fingerprint、对象归属或状态机做 `reuse/resume/continue`，validation 只能校验合法性，不能再加一层“先改成另一种 action 才能通过”的前置编排。
  - 高风险写 continuation / update 的授权应优先看“用户是否直接点名现有对象”，而不是继续要求整份新合同全文 overlap；但对象级授权也不能放宽成“点名对象即可随意改成无关目标”。
  - 写 continuation / update 里，`cwd/resourceMode/useWorktree` 不是普通合同噪声，而是执行 lane；若 lane 变化，就算用户已点名现有 `plan/task`、goal 也仍然相近，也必须补到对新 lane 的显式授权，否则宁可拦住。
  - 不要把“唯一候选时严格、多个候选时放松”当成降级策略；若多个语义候选在 write lane 上存在分歧，风险只会更高，不会更低，guard 必须要求用户把新 lane 说清楚，而不是退回 title/goal overlap 放行。
- 读取阶段先做编码校验：优先按 UTF-8 解释内容，避免基于终端乱码做补丁匹配
- 终端乱码不等于文件损坏：以文件内容/diff 为准，不以显示层为准
- Markdown 修改优先最小差异：定位目标段落/行一次替换，避免试探式补丁
- 每次改动后立即校验 `git diff` 与行数；连续失败立即回滚 `HEAD` 再重试

## Skill 使用

- 命中 skill 必须调用；调用后等待完成再执行

## 输出格式

- 禁预告文字 · 状态用符号 ✓/✗/→ · 一次性批量 Edit · 数据优先 · 直达结论 · 工具间隔零输出 · 错误格式 ✗ {位置}:{类型} · 代码块零注释 · ≥2 条用列表 · 路径缩写（. 项目根 · ~ 主目录）· 禁总结性重复 · 进度 {当前}/{总数} · 提问直入

## 技术栈

- TypeScript（ESM）+ 严格类型

## 核心命令

- 启动：`tsx src/bootstrap/cli/index.ts`
- WebUI：`tsx src/bootstrap/cli/index.ts --port 8787`
- Windows 编码/换行：`pnpm fix:crlf` / `pnpm fix:bom`

## Worktree 工作流

- 默认 worktree 根目录使用 `./.worktrees/`；若目录不存在，先创建并确保被 git ignore，再创建新 worktree，避免重复询问位置。
- 使用标准 `git worktree` 流程，不再约定固定 `worktree-1/2/3` 槽位
- 从 `main`/`origin/main` 创建 topic worktree；在各自 worktree 内独立开发、提交、rebase
- 合流按常规 PR / merge 流程处理；本地清理使用 `git worktree remove`
- `pnpm run review-code-changes` 作为合流前质量门禁，非 worktree 专用协议

## 目录结构

- 入口：`src/bootstrap/cli/index.ts` · 调度：`src/kernel/` + `src/work/` + `src/surface/` · 角色层：`src/policy/manager/` + `src/execution/worker/`（外部执行编排与结果回写）
- 基础：`src/execution/providers/` + `src/bootstrap/config.ts` + `src/persistence/fs/` + `src/persistence/storage/` + `src/persistence/log/`
- 服务：`src/surface/http/` + `webui/` · 状态：`.mimikit/`（见 `docs/design/workflow/interfaces-and-state.md`）

## 文档

- `docs/design/architecture/system-architecture.md` · `docs/design/*`

## 代码规范

- 文件/模块尽量解耦，避免隐式耦合
- 注释只解释不直观逻辑
- 总是使用 if-return 的早返回模式
