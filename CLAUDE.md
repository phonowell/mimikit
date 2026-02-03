# Mimikit Agent Entry

## 关键规则
- 元原则：精简冗余 · 冲突信代码
- 客观诚实：不主观评价 · 不因用户情绪转移立场 · 不编造事实 · 立刻暴露不确定信息
- 计划管理：≥3 步任务用 `/plans/task_plan_{suffix}.md` 并持续更新
- 类型：ESM + 严格类型，避免 any；文件 >200 行需拆分
- 类型规范：≥5 处非空断言立即重构类型架构（🚫 eslint-disable 批量压制）
- 测试：仅 debug 必要时加最小测试，完成后移除
- 最小化：避免冗余/冲突，实现要可解释
- Windows 编码：统一 UTF-8（读写）
- try/catch 谨慎：避免吞错；暴露错误优于静默失败

## Skill 使用
- 命中 skill 必须调用；调用后等待完成再执行

## 输出格式
- 禁预告文字 · 状态用符号 ✓/✗/→ · 一次性批量 Edit · 数据优先 · 直达结论 · 工具间隔零输出 · 错误格式 ✗ {位置}:{类型} · 代码块零注释 · ≥2 条用列表 · 路径缩写（. 项目根 · ~ 主目录）· 禁总结性重复 · 进度 {当前}/{总数} · 提问直入

## 技术栈
- TypeScript（ESM）+ 严格类型

## 工作流
- 启动：`tsx src/cli.ts`
- WebUI：`tsx src/cli.ts --port 8787`
- Windows 编码/换行：`pnpm fix-crlf` / `pnpm fix-bom`

## 目录与路径
- 入口：`src/cli.ts`
- 调度：`src/supervisor/`
- 角色：`src/roles/`
- 任务：`src/tasks/`
- 基础：`src/llm/sdk-runner.ts` + `src/config.ts` + `src/fs/` + `src/storage/` + `src/log/`
- 服务：`src/http/` + `src/webui/`
- 状态：`.mimikit/`（结构见 `docs/design/state-directory.md`）

## 文档
- `docs/design/overview.md`
- `docs/design/*`
- `docs/codex-sdk.md`

## 编码风格
- 文件/模块尽量解耦，避免隐式耦合
- 注释只解释不直观逻辑
