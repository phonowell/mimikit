# MIMIKIT

## 项目概览

- 目标：基于 codex 开箱能力，构建轻量级 AI 助手，代码规模控制在 1 万行以内。
- 定位：小助手；要能揣测用户意图，并准确、高效、低成本地完成任务。
- 特点：单一主 session 架构，内置 WebUI 界面；复用生态能力，避免重复造轮子。

## 关键规则

- 元原则：精简冗余 · 冲突信代码
- 客观诚实：不主观评价 · 不因用户情绪转移立场 · 不编造事实 · 立刻暴露不确定信息
- 计划管理：≥3 步任务用 `/plans/task_plan_{suffix}.md` 并持续更新
- 类型：ESM + 严格类型，避免 `any`；文件 >200 行需拆分
- 代码规模硬上限：`src/` 总代码行数必须 ≤10000；新增功能必须同步删减/裁切旧功能以维持上限并保持简洁，从屎山中逃离；禁止通过格式化代码压缩行数，这属于自我欺骗
- 类型规范：≥5 处非空断言立即重构类型架构（🚫 `eslint-disable` 批量压制）
- 测试硬上限：最多只保留 50 个测试用例，且所有测试必须为单一用例（禁止复合用例）；若新增用例重要到必须加入，必须同步移除一个相对不重要的旧用例
- 最小化：避免冗余/冲突，实现需可解释且高 ROI
- Prompt 规范：面向 LLM 的提示词禁止硬编码在 TS/JS 中；统一放在 `prompts/` 并通过构建器注入
- 禁止词表驱动功能实现：任何核心能力不得依赖关键词列表硬编码判定；必须使用可泛化、可验证的机制（结构化信号/模型判别/规则引擎）
- try/catch 谨慎：避免吞错；暴露错误优于静默失败
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

- 角色分工：`~/Projects/mimikit` 固定 `main`（汇总/发布）；`~/Projects/mimikit-worktree-{1,2,3}` 对应 `worktree-{1,2,3}`（并行槽位）
- 槽位限制：`pnpm run sync` / `pnpm run merge` 仅允许在 `worktree-1/2/3` 执行，禁止在 `main`
- 日常同步：在槽位运行 `pnpm run sync`（`fetch --prune` + `rebase main`）
- 合并流程：先运行 `review-code-changes` skill，再运行 `pnpm run merge`（自动提交→同步 `main`→squash 合并）
- 合并后保留槽位分支与 worktree；`pnpm run merge` 会清空 `plans/`；发布/推送仅在 `main`

## 目录结构

- 入口：`src/cli/index.ts` · 调度：`src/orchestrator/` · 角色：`src/{teller,thinker,worker}/` · 任务：`src/tasks/`
- 基础：`src/llm/sdk-runner.ts` + `src/config.ts` + `src/fs/` + `src/storage/` + `src/log/`
- 服务：`src/http/` + `webui/` · 状态：`.mimikit/`（见 `docs/design/interfaces-and-state.md`）

## 文档

- `docs/design/system-architecture.md` · `docs/design/*` · `docs/codex-sdk.md`

## 代码规范

- 文件/模块尽量解耦，避免隐式耦合
- 注释只解释不直观逻辑
- 总是使用 if-return 的早返回模式
