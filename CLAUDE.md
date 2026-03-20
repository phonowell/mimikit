# MIMIKIT

## 项目概览

- 目标：基于 codex 开箱能力，构建面向无人在线时段的低成本自治作业系统。
- 定位：产品是异步自治作业系统；实现是单 session 轻量编排层，负责意图理解、任务编排与状态治理，不直接执行任务。
- 特点：适配长时间异步窗口，内置 WebUI；执行链路委托外部运行时，默认留待人返回后复盘、确认与续跑。

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
- Prompt 规范：面向 LLM 的提示词禁止硬编码在 TS/JS 中；统一放在 `prompts/` 并通过构建器注入
- 禁止词表驱动功能实现：任何核心能力不得依赖关键词列表硬编码判定；必须使用可泛化、可验证的机制（结构化信号/模型判别/规则引擎）
- try/catch 谨慎：避免吞错；暴露错误优于静默失败
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

- 启动：`tsx src/cli/index.ts`
- WebUI：`tsx src/cli/index.ts --port 8787`
- Windows 编码/换行：`pnpm fix:crlf` / `pnpm fix:bom`

## Worktree 工作流

- 使用标准 `git worktree` 流程，不再约定固定 `worktree-1/2/3` 槽位
- 从 `main`/`origin/main` 创建 topic worktree；在各自 worktree 内独立开发、提交、rebase
- 合流按常规 PR / merge 流程处理；本地清理使用 `git worktree remove`
- `pnpm run review-code-changes` 作为合流前质量门禁，非 worktree 专用协议

## 目录结构

- 入口：`src/cli/index.ts` · 调度：`src/orchestrator/` · 角色层：`src/manager/` + `src/worker/`（外部执行编排与结果回写）
- 基础：`src/providers/` + `src/config.ts` + `src/fs/` + `src/storage/` + `src/log/`
- 服务：`src/http/` + `webui/` · 状态：`.mimikit/`（见 `docs/design/workflow/interfaces-and-state.md`）

## 文档

- `docs/design/architecture/system-architecture.md` · `docs/design/*`

## 代码规范

- 文件/模块尽量解耦，避免隐式耦合
- 注释只解释不直观逻辑
- 总是使用 if-return 的早返回模式
