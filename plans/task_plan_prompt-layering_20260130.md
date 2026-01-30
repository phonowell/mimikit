# Task Plan: prompt-layering (2026-01-30)

## 目标
- 运行时指令上移到 CLAUDE.md（system），buildPrompt 仅保留动态上下文
- 清理静态 prompt 拼接与 prompts/agent/ 冗余文件
- 更新架构文档以反映新的 prompt 分层

## 范围
- CLAUDE.md
- src/agent-prompt.ts
- src/prompt.ts
- src/agent-run.ts
- prompts/agent/*.md（删除已迁移）
- docs/minimal-architecture.md

## 计划
1) 读取并合并 prompts/agent/{soul,core,task-delegation,memory,self-awake}.md 到 CLAUDE.md，标注运行时指令；开发规范移至 docs/dev-conventions.md（≤100 行） ✅
2) 简化 prompt 装配：更新 src/agent-prompt.ts / src/prompt.ts / src/agent-run.ts（仅动态上下文 + 状态目录提示） ✅
3) 清理 prompts/agent 迁移文件；保留 state-dir.md 与 prompts/task/core.md ✅
4) 更新 docs/minimal-architecture.md 的 prompt 分层与自唤醒来源说明 ✅

## 决策
- 保留 state-dir.md 作为动态提示模板
- CLAUDE.md 仅承载运行时指令；开发规范移至 docs/dev-conventions.md
- docs/agent-runtime.md 同步新分层说明

## 风险
- buildPrompt 签名变更导致编译失败（需检查引用）
- CLAUDE.md 超过 100 行需要压缩

## 状态
- 当前：完成
- 进度：4/4
