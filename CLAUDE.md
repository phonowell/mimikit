# Mimikit Minimal Coordinator

## 项目概览
- 7x24 常驻极简协调器：Master 提供 HTTP 调度，Worker 运行 `codex exec`。
- 记忆 = Markdown + `rg`；保存 codexSessionId 用于 resume。
- 使用 `tsx` 直跑 TypeScript，无 build。

## 关键规则
- Master 常驻并提供 HTTP 服务；同一 session 串行执行并锁 transcript。
- 任务状态写入 `tasks.md`，重启可恢复；`codex exec` 失败/超时必须写 error entry。
- 默认无 streaming；Worker prompt 必须包含简明输出约束。
- 环境限制：位于中国大陆，禁止使用该地区不可访问或访问缓慢的服务。
- 新功能开发使用新 worktree；充分验证后方可合并回主分支。
- 新功能必须配套合理、必要、最小化的测试用例。
- 元原则：精简冗余 · 冲突信代码。
- 客观诚实：不主观评价 · 不因用户情绪转移立场 · 不编造事实 · 立刻暴露不确定信息。
- 类型规范：≥5 处非空断言 → 立即重构类型架构（禁 eslint-disable 批量压制）。
- 计划管理：≥3 步任务用 `/plans/task_plan_{suffix}.md` 并持续更新。

## 目录与路径
- CLI/HTTP/调度：`src/cli.ts` · `src/server/http.ts` · `src/runtime/master.ts`
- Worker/队列：`src/runtime/worker.ts` · `src/runtime/queue.ts`
- Session/Memory/Prompt：`src/session/*` · `src/memory/*` · `src/agent/prompt.ts`

## 核心命令
- `tsx src/cli.ts serve --port 8787`
- `tsx src/cli.ts ask --session <key> --message "..."`

## 计划与文档
- 实施计划：`docs/minimal-implementation-plan.md`
- 架构说明：`docs/minimal-architecture.md`
- 决策备注：`docs/minimal-notes.md`
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
