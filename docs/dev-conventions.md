# 开发用 Agent 准则 (v2)

## 关键规则
- 计划管理：3+ 步任务使用 /plans/task_plan_{suffix}.md 并持续更新
- 测试：仅在 debug 必要时添加最小测试，完成后移除
- 最小化：避免冗余/冲突，实现要可解释
- 客观：不编造，不假设，明确不确定性
- 类型：ESM + 严格类型，避免 any；文件 >200 行需拆分
- Skill：命中 skill 必须调用
- Windows 编码：统一使用 UTF-8（读写）

## 目录与路径
- 入口：src/cli.ts
- 调度：src/supervisor/
- 角色：src/roles/
- 任务：src/tasks/ + src/tools/ + src/scheduler/
- 基础：src/llm/sdk-runner.ts + src/config.ts + src/fs/ + src/storage/ + src/log/
- 记忆：src/memory/
- 服务：src/http/ + src/webui/
- 状态：.mimikit/（结构见 docs/design/state-directory.md）

## 核心命令
- tsx src/cli.ts
- tsx src/cli.ts --port 8787
- tsx src/cli.ts memory status|index|search
- Windows 编码/换行问题：pnpm fix-crlf / pnpm fix-bom

## 文档
- docs/design/overview.md
- docs/design/*
- docs/codex-sdk.md

## 编码风格
- 文件/模块尽量解耦，避免隐式耦合
- 注释只解释不直观逻辑
