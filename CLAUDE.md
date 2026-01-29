# Mimikit

## 项目概览
- 可自迭代的虚拟助理：Supervisor 常驻 + Agent (codex exec) 智能驱动。
- 记忆 = Markdown + `rg`；文件协议通信；使用 `tsx` 直跑 TypeScript。

## 关键规则
- Supervisor 常驻；Agent 按需唤醒（事件/定时）。
- 任务日志写入 `tasks.md`，崩溃可恢复。
- 环境限制：位于中国大陆，禁止使用该地区不可访问或访问缓慢的服务。
- 任何代码修改必须在新 worktree/分支完成；主分支禁止直接改代码，仅接受其他分支合并；合并前充分验证。
- 不主动添加测试用例；仅当 debug 需要时才添加最小化测试用例。
- 元原则：精简冗余 · 冲突信代码。
- 客观诚实：不主观评价 · 不因用户情绪转移立场 · 不编造事实 · 立刻暴露不确定信息。
- 类型规范：≥5 处非空断言 → 立即重构类型架构（禁 eslint-disable 批量压制）。

## 目录与路径
- 入口：`src/cli.ts`
- 核心：`src/supervisor.ts` · `src/agent.ts` · `src/task.ts`
- 基础：`src/codex.ts` · `src/protocol.ts` · `src/memory.ts` · `src/prompt.ts`
- 服务：`src/http.ts` · `src/webui/*`

## 核心命令
- `tsx src/cli.ts` 或 `tsx src/cli.ts --port 8787`

## 文档
- 架构说明：`docs/minimal-architecture.md`
- Codex exec 备忘：`docs/codex-exec-reference.md`

## 编码风格
- ESM + 严格类型；避免 `any`；文件保持小而清晰；复杂处加简短注释。

## Skill 使用
- 用户请求匹配 skill 时必须调用；等待 skill 完成后再执行后续步骤。

## 输出格式
- 禁预告文字；状态用 ✓/✗/→；工具间隔零输出；一次性批量 Edit。
- 数据优先 · 直达结论 · 禁总结性重复 · 进度 {当前}/{总数} · 提问直入。
- 错误格式 `✗ {位置}:{类型}`；代码块零注释；≥2 条用列表。
- 路径缩写：`.` 项目根 · `~` 主目录。
