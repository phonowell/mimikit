# Moltbot Prompt 系统深入报告

> 生成时间: 2026-02-01
> 数据来源: 读取本地仓库 D:\Project\moltbot 的实现与模板文件

## 1. 范围与证据
- 核心系统 prompt 生成: `..\moltbot\src\agents\system-prompt.ts`
- 嵌入式运行的 prompt 装配: `..\moltbot\src\agents\pi-embedded-runner\run\attempt.ts`
- Prompt override 与运行入口: `..\moltbot\src\agents\pi-embedded-runner\system-prompt.ts`
- Prompt 报表与统计: `..\moltbot\src\agents\system-prompt-report.ts`
- /context 报告输出: `..\moltbot\src\auto-reply\reply\commands-context-report.ts`
- 工作区注入文件与截断策略: `..\moltbot\src\agents\workspace.ts`, `..\moltbot\src\agents\pi-embedded-helpers\bootstrap.ts`
- skills prompt 生产与筛选: `..\moltbot\src\agents\skills\workspace.ts`
- Gateway/OpenAI/OpenResponses 的 extraSystemPrompt: `..\moltbot\src\gateway\openai-http.ts`, `..\moltbot\src\gateway\openresponses-http.ts`
- 模板文件: `..\moltbot\docs\reference\templates\*.md`

## 2. Prompt 组装流程（从输入到系统提示）
1. **消息侧额外系统提示拼接**
   - 群聊 intro + group system prompt 合并为 extraSystemPrompt。
   - 入口见 `runPreparedReply`。
2. **嵌入式运行装配**
   - 读取 skills / bootstrap files / tools / runtime / sandbox。
   - 统一调用 `buildEmbeddedSystemPrompt`，生成系统提示。
3. **系统 prompt 覆盖**
   - `createSystemPromptOverride` 保证模型使用运行时拼装的完整系统提示。
4. **插件前置注入**
   - before_agent_start hook 可 prepend context 到 prompt。
5. **CLI 场景**
   - 强制追加 “Tools are disabled” 以避免工具调用。

## 3. System Prompt 结构（buildAgentSystemPrompt）
- 固定身份行 + Tooling 段
  - 明确工具名大小写敏感、仅能调用列出工具。
- 可开关段落
  - Skills / Memory / Docs / Reply Tags / Messaging / Voice / Reactions / Heartbeats / Silent Replies。
- PromptMode
  - full / minimal / none。
  - subagent 默认 minimal。
- extraSystemPrompt
  - 明确放在 Group Chat Context / Subagent Context 区域。
- Runtime / Workspace / Model Aliases
  - 补充运行环境与模型信息。

## 4. 上下文注入来源与控制
- 工作区注入文件：
  - `AGENTS.md / SOUL.md / TOOLS.md / IDENTITY.md / USER.md / HEARTBEAT.md / BOOTSTRAP.md / MEMORY.md`。
- 截断策略：
  - 超长文件保留 head+tail，并加入截断 marker。
- subagent 限制：
  - 子会话仅注入 AGENTS.md + TOOLS.md。
- skills prompt：
  - `<available_skills>` XML-like 结构 + 只读一个 skill 的流程指令。

## 5. extraSystemPrompt 来源
- 群聊 intro / group system prompt。
- OpenAI/OpenResponses 的 system/developer 消息。
- OpenResponses 的 tool_choice 强制工具调用。
- CLI 模式中追加 “Tools are disabled”。

## 6. 专项 Prompt 与流程
- Subagent 专用 system prompt：
  - 强规则、禁止 message tool、禁止心跳。
- Memory Flush：
  - compaction 临界触发，强制 NO_REPLY 指引。
- Heartbeat：
  - 默认 prompt 强制读 HEARTBEAT.md，空则 HEARTBEAT_OK。
- Reasoning Tag Hint：
  - 特定 provider 下强制 <think>/<final> 输出。

## 7. Prompt 观测与报表
- systemPromptReport 统计：
  - 总字符数、Project Context 占比、工具 schema 字符数、skills prompt 字符数。
- /context 命令：
  - 人类可读或 JSON 报告，包含 per-file / per-tool / per-skill 排行。

## 8. 对 Mimikit 的直接借鉴方向
- 引入 promptMode（full/minimal/none）分角色降噪。
- 建立 prompt 预算报表（按段统计字符/占比）。
- extraSystemPrompt 独立标签区，统一入口。
- 工具区动态化：按可用工具生成列表，提示大小写敏感。
- 注入文件截断策略：head+tail+marker，避免单文件挤爆。

## 9. Prompt 行文风格可学习点（从模板与系统 prompt 总结）
- **短句 + 强动词**：大量使用命令式短句（Do/Don't/Only/Always）。
- **显式边界**：用 “only / never / must” 直接封死灰区。
- **例子与反例**：用 “正确/错误” 或 “例子”减少模型误读。
- **行为阈值**：明确触发条件（如 HEARTBEAT_OK / NO_REPLY）。
- **分段清晰**：标题即职责，段内不混合主题。
- **可编辑模板**：用户可写的内容保持“人味”，系统提示保持“硬规则”。
- **决策树语气**：用“当…时 / 如果…则”推进模型分支判断。
- **角色自我约束**：subagent prompt 强化“你不是主 agent”。

---

本报告用于内部参考与 prompt 设计对照。可按需更新。