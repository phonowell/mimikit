# Notes: prompt-layering (2026-01-30)

## 现状摘录
- src/agent-prompt.ts 仍拼接 SOUL/CORE/TASK_DELEGATION/MEMORY/SELF_AWAKE
- src/prompt.ts 负责加载 prompts/agent/*.md 并导出 SYSTEM_PROMPT/STATE_DIR_INSTRUCTION
- docs/minimal-architecture.md 引用 prompts/agent/self-awake.md

## 需求要点
- CLAUDE.md 作为运行时 system 指令载体
- buildPrompt 仅动态上下文（对话历史/记忆命中/用户输入/任务结果/自唤醒上下文/状态目录提示）
- 删除 prompts/agent 静态模板（保留 state-dir.md）

## 已完成
- CLAUDE.md 合并运行时指令；开发规范移至 docs/dev-conventions.md
- buildPrompt 仅动态上下文；prompt.ts 移除静态模板加载
- 删除 prompts/agent/{soul,core,task-delegation,memory,self-awake}.md
- docs/minimal-architecture.md 与 docs/agent-runtime.md 更新分层说明
