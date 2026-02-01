# Notes: teller-humanize

## Observations (initial)
- Teller 现有 identity 以“硬规则 + 事件优先级”为主，缺少“自然对话/人味”提示。
- tools/output 约束清晰，但未指引回复语气（同理心、确认、语气贴合用户）。
- buildTellerPrompt 只加载 identity/tools/output；没有独立 voice/style 段落。
- 事件提示（planner_needs_input/planner_failed/task_results）是指令式短句，缺少对用户情绪/体验的兜底表达。
- repo 内已有 moltbot 风格研究文档（docs/research/*），可复用其“人味/硬规则分层”思路。

## Moltbot references
- docs/research/moltbot-prompt-style.md（风格特征/人味与硬规则分层）
- docs/research/moltbot-prompt-analysis.md（决策树语气、模板分段、例子/反例）
- D:/Project/moltbot/docs/reference/templates/SOUL.md（“避免僵硬、强调真实帮助”的人味指引）
- D:/Project/moltbot/src/auto-reply/reply/groups.ts（“Write like a human…”风格行）

## Decisions
- 新增 prompts/agents/teller/voice.md，将“人味/语气”与硬规则分层（参考 moltbot SOUL.md 与 style line）。
- buildTellerPromptSections 注入 <voice> 段落，保持最小代码改动。
- tools.md 示例与注意事项微调，强化“自然回复/下一步预期/简短提问”。
- type-check 暴露 src/storage/queue.ts 的 noUncheckedIndexedAccess 问题，新增索引空值保护以通过检查。

## Risks
- 无新增行为风险；仅新增提示段落与文本示例。
- type-check 修复属于既存问题最小补丁。

## Tests
- pnpm -s lint
- pnpm -s tsc -p tsconfig.json --noEmit
- pnpm -s test
