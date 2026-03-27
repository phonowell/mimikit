# MIMIKIT

## 项目概览

- 目标：基于 codex 开箱能力，构建面向无人在线时段的低成本自治作业系统。
- 定位：产品是异步自治作业系统；实现是单 session 轻量编排层，负责意图理解、任务编排与状态治理，不直接执行任务。
- 特点：适配长时间异步窗口，内置 WebUI；执行链路委托外部运行时，默认支持人返回后复盘、确认与续跑；若验收门禁通过，也允许离线自动闭环。

## 目标收敛

- 长期目标：做“极简版、特化的主 agent 编排层”，而不是通用 agent 平台。
- 主 agent 只保留高价值上下文：目标、计划、当前状态、验收门禁；默认不直接承担大段搜索、实现、细读、批量改写。
- subagent 是默认局部执行面：搜索、实现、局部修复、文档细读、测试排查优先委派给 subagent；主线程只接收压缩后的结论、工件与提交结果。
- 文件系统是主状态层：任务、计划、证据、handoff、总结、长期记忆都应落盘并可追溯；消息历史只保留高信号摘要，不承担长期真相源职责。
- 空闲生命周期默认只做派生维护任务：允许在 idle 窗口执行记忆刷新、归档整理、历史压缩、低优先级总结；若显式验收门禁通过，可有限自动写回 `task状态`、`plan进度`、`archive`、`focus`；不得越权改写 `用户目标`、`验收标准`、`memory`。
- cron / memory / idle hook 都只能服务主链路收敛，禁止长成第二套调度系统、过程状态总线或隐式代理层。

## 项目目标边界

### 我们是什么

- 面向无人在线时段的异步自治作业系统。
- 基于 codex 开箱能力构建的单 session 轻量编排层。
- 负责意图理解、任务编排、状态治理与验收门禁，不直接承担主要执行。
- 以文件系统为主状态层，以 WebUI 作为友好展示层与在线操作面。

### 我们不是什么

- 不是通用 agent 平台，不是第二套长期膨胀的基础设施层。
- 不是直接执行所有任务的超级主 agent；主线程不承载大段搜索、实现、细读、批量改写。
- 不是由消息历史承载真相源的聊天机器人；消息只保留高信号摘要。
- 不是把 cron、memory、idle hook 做成隐式调度系统或过程状态总线。

### 我们要做什么

- 把主 agent 收敛为极简、特化的编排层，只保留目标、计划、当前状态与验收门禁。
- 默认把搜索、实现、排查、细读等局部工作委派给 subagent 或外部运行时，并只接收压缩后的结论与工件。
- 把任务、计划、证据、handoff、总结、长期记忆落盘并保持可追溯。
- 围绕长时间异步窗口优化，让系统在用户离线时低成本推进；门禁通过时允许有限自动闭环，用户返回后仍可复盘、确认与续跑。

### 我们不做什么

- 不把 `focus` 做成任务板，不让 `summary/openItems` 承载执行步骤、验收标准或恢复指令。
- 不让长期记忆吸收过程态、当前进度或待办；`memory` 只保留稳定事实、偏好与约束。
- 不让 idle 维护任务越过验收门禁改写真相源；证据不足时只能停在 handoff，不得伪完成或低置信度收口。
- 不为低 ROI 功能新增模块、配置、兼容层或抽象壳；新增前优先删减、复用、内联。

## 经确认的硬边界（2026-03-25）

- 若本文旧表述与本节冲突，以本节为准。
- 文件系统是唯一真相源；消息历史、UI 展示与运行日志都不是最终真相源。
- 主 agent 只负责目标理解、计划编排、状态治理与验收门禁，不直接承担具体执行。
- 所有具体工作默认外放给 subagent 或外部运行时；主线程保持低上下文，只保留目标、计划、当前状态与验收门禁。
- WebUI 是友好展示层，也是用户在线时可直接操作的界面；它展示和修改的都应回写到文件系统真相源。
- `task` 表示要完成什么，`plan` 表示如何推进，`focus` 只表示当前关注点摘要，`memory` 只表示长期稳定事实、偏好与约束。
- `task / plan / focus / memory` 必须严格分层；任何实现都不得把其中一个偷渡成另一个的承载层。
- `focus` 不是任务板；`summary/openItems` 不得承载执行步骤、验收标准或恢复指令。
- `memory` 只允许保存长期稳定内容；短期进度、过程态、待办、临时判断不得进入 `memory`。
- subagent 回传必须收敛为压缩结果：结论、证据路径、提交 hash、验证结果；禁止把大段原始上下文回灌主线程。
- 离线推进不只允许产出工件，也允许在门禁通过后推进主状态；但自动写回只能落在 `task状态`、`plan进度`、`archive`、`focus`。
- 离线自动化绝不允许改写 `用户目标`、`验收标准`、`memory`；这些只能由更高层显式决策更新。
- 只有主 agent 能宣布 `task.done` / `task.failed` 一类收口状态；subagent 只能提交证据、结果与 handoff。
- 证据不足时，系统必须停在 handoff 或待续跑态，不得因为想“继续推进”而低置信度收口。
- 新功能默认先拒绝；只有在 ROI 明确高、边界更硬或复杂度更低时才允许进入主线。

## 我们的缺口是什么

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
- 当前业务主线缺口已闭环；规模治理仅保留为 nice-to-have 工程目标，不作为当前业务缺口或阻塞项。
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
- subagent 回传约束：只回传压缩后的结论、证据路径、提交 hash、验证结果；禁止把大段原始上下文回灌主线程。
- Prompt 规范：面向 LLM 的提示词禁止硬编码在 TS/JS 中；统一放在 `prompts/` 并通过构建器注入
- 禁止词表驱动功能实现：任何核心能力不得依赖关键词列表硬编码判定；必须使用可泛化、可验证的机制（结构化信号/模型判别/规则引擎）
- try/catch 谨慎：避免吞错；暴露错误优于静默失败
- idle 维护约束：记忆压缩、问题总结、归档整理等后台任务默认只产出派生工件；只有显式验收门禁通过时，才允许有限写回 `task状态`、`plan进度`、`archive`、`focus`，且不得改写 `用户目标`、`验收标准`、`memory`。
- 测试策略：仅补充能覆盖真实风险/回归点的最小必要用例，不滥加；尤其 `webui`/`telegram` 层禁止添加低价值、易变测试用例
- 测试反模式（禁止新增）：同一函数同一路径的重复断言（如仅换文案字面量）；纯字符串映射/normalize 薄测试（无状态转换、无分支风险）；强耦合厂商命名/UA 版本/提示词文案的脆弱断言
- 测试替代策略：优先覆盖跨模块行为与稳定契约（输入→状态变化→输出）；一个主路径 + 一个关键回退分支即可，避免为次级回退链路逐层加测试
- 测试合并规则：若新用例仅验证已被更高层测试覆盖的同一语义，直接并入现有测试或删除旧低 ROI 用例，不并存
- 执行 `pnpm lint` 大胆用，不要担心会带来的代码变更
- 编码统一：Windows 环境读写均按 UTF-8 处理

## 当前系统环境注意事项（经验教训）

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
