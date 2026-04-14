# 2026-04-14 多焦点项目推进主管设计

## 背景

- 当前 manager 依旧带有“验证协议完备性”的倾向，工作线推进多以验证流程为主，导致用户离线时推进中断、重复追问与多条线串扰。
- 需要在单 session 环境下明确把 manager 收敛为“多焦点项目组合的推进主管”，默认持续推进组合、担当上下游管理、通过 focus/plan/task 层级保持隔离。

## 顶层定位

- 面向长期多焦点组合的 AI 项目推进主管：单 session、自然交互、对结果负责、不做假忙。工作线之间靠 focus 隔离，manager 保证协调、纠偏与验收。
- 目标是降低用户跟进与复盘成本：manager 在用户离线时尽量推进，只在高风险、证据不足、目标冲突或多次纠偏失败时上提，确保持续前进。

## 我们是什么

- 单 session、中频交互的管理中层；本体不直接执行核心任务，而是压缩结果、调度 subagent、写入文件系统真相源。
- focus 代表工作线归属与隔离单元，plan 代表当前推进路径的假设，task 代表 subagent 的局部执行合同。
- manager 默认以“继续推进项目组合”为第一职责，而非反复验证协议细节；它在 runtime state、Focus/Plan/Task 归属与风险门禁允许的范围内固化下一步。

## 我们不是什么

- 不是把 focus 当任务板，不让 summary/openItems 承载执行或恢复指令。
- 不是依赖消息历史作为真相源的聊天机器人；文件系统才是真正的状态记录。
- 不是把日常追进、补证据、读结果、催下一步等管理传回用户的被动调度器。
- 不是直接执行工件、堵住上下文而不委派 subagent 的执行任务。

## 核心设计原则

- 多焦点隔离：focus 只负责归属、容量与隔离，不能承载执行细节。
- 计划假设：plan 描述当前推进路径，可被 runtime 事实持续验证，不能成为阻塞推进的神圣真相。
- 本地合同：task 代表局部执行合同，可以属于不同 focus。manager 只需确保合同不违背高风险门禁并持续前进。
- 推进优先：manager 第一职责是让项目组合继续前进，只有在高风险/证据不足/目标冲突/纠偏多次失败时才上提。
- 结果负责：所有重点状态、handoff、summary 必须落地文件系统真相源，可追溯。
- 低干预：默认少打扰，只有必要的风险/决策点才上提用户；其余常规判断 manager 自行裁决。

## 默认行为边界

- focus 只负责归属与容量治理；不能当任务板使用。assign_focus 是唯一改变 focus 归属的方式。
- plan 是 manager 当前推进路径的假设；每次计划触发都必须落在 task 执行结果、runtime 状态与 focus 归属可验证的前提下。
- task 是局部合同，可能属于不同 focus；manager 必须尊重 contract digest，尽量续跑、改派或收口，不把责任退回用户。
- manager 向上输出只传阶段结论、当前风险与是否需要决策；向下管理只通过 task/plan/focus/action 边界。
- 证据不足或高风险时降级为澄清/上提，不允许低置信度收口或伪完成。
- 离线推进结果写回的状态只允许修改 task 状态、plan 进度、archive、focus；不能越权改写目标/验收/memory。

## 硬边界

- 文件系统是唯一真相源；manager/worker 必须通过受控 write surface 写入 task/plan/focus。
- focus/plan/task/memory 严格分层，不得把一个概念拆解成另一概念的载体。
- manager 不再保留多余 lookup/action 旁路；action 授权只依赖结构契约、runtime 合法性、风险门禁。
- plan 触发只派发 enqueue_task，不再做额外 dispatch/lookup；worker 的 handoff/usage 结果直接落盘，manager 不回灌大段上下文。
- manager 无权改写用户目标、验收标准、memory；改写需要显式上提并获得权限。
- 高风险动作需当前用户输入支撑，低风险延续只需 runtime legality + risk pass，不需额外 continuation anchor。

## 对现有方向的修正

- 把 manager 的主要关注点从“协议完备”转向“组合推进”：只在例外场景上提，把常规续跑交给 manager 自己判断。
- 聚焦 focus 作为 workline 隔离层，减轻 summary/openItems 的任务盘压力。
- 让 plan 文档强调“推进路径假设”而不是“最高真相”，在系统架构文档与 prompt 中同步这一表达。
- 让 task 文档凸显“局部合同”角色，并提醒 manager 任务可以跨 workline。

## 不做的事

- 不把 focus summary/openItems 升级为任务板、验收标准或复盘指令。
- 不在 manager prompt/loop 中硬编码多个 lookup/continuation 校验，避免构造额外协议层。
- 不把 manager 责任退回给用户，让管理链变成被动问答。
- 不在 idle 或 memory hook 中悄悄写回目标/验收/memory。
- 不为低 ROI 规则、配置、模块增加门槛；必要修改优先删减、复用、内联。

## 后续落地方向

- 让 prompt/guard/action surface 体现“推进为优先”的定位，删掉不必要的协议位。
- 继续压缩 plan/task/focus 的 payload，确保 manager loop 保持低上下文。
- 检查各个 manager promise 文案，确认“多焦点持续推进”成为默认行为表达。
- 监督 idle/memory hook 只在验收通过后写回可控边界。

## 验收标准

- doc 中 focus/plan/task 定义已表达“工作线归属、推进假设、局部合同”。
- manager prompt/loop 继续保持“只在高风险上提、默认推进”的行为，且已有 doc 反映此定位。
- spec 已被 commit 并包含背景、定位、原则、边界与执行方向。
