# JS 生态 Manager 能力调研（2026-02-12）

## 结论（直达）
- 推荐优先级：`openai/openai-agents-js` + `langchain-ai/langgraphjs`（含 `@langchain/langgraph-supervisor`）> `mastra-ai/mastra` > `elizaOS/eliza`。
- 若目标是“最短路径补强 manager 重心把握”：先做 `openai-agents-js` 风格 loop/handoff/session PoC，再按需叠加 `langgraph-supervisor` 的中心 supervisor 架构。
- `mastra` 能力强但仓库体量明显更大，且许可证元信息存在“GitHub 显示 Other / 根包 Apache-2.0”差异，落地前需法务确认。

## 范围与方法
- 范围：JavaScript + TypeScript（按你的要求合并计入 JS 生态）。
- 目标能力：manager 编排语义、会话/历史控制、中断恢复、可观测性、接入成本。
- 数据时间：2026-02-12（仓库星数/更新时间/README 声明均按该日采集）。

## 候选对比

| 候选 | manager/编排语义 | 历史/记忆/恢复 | 可观测性 | 接入重量（相对） | 许可证 | 结论 |
|---|---|---|---|---|---|---|
| `openai/openai-agents-js` | 多 agent workflow + handoff + loop 终止条件 | loop 内明确消息历史追加；支持 `maxTurns`；长任务 suspend/resume 仍是 Future | 内建 tracing | 中 | MIT | 适合先做 manager PoC |
| `langchain-ai/langgraphjs` + `@langchain/langgraph-supervisor` | 低层可控 orchestration；supervisor 中心调度/多级层级 | supervisor 支持历史模式；可接 checkpointer/store 做短长记忆 | 生态含 LangSmith/Platform（开源版也可单独用） | 中 | MIT | 适合做“可控 supervisor”正式架构 |
| `mastra-ai/mastra` | 图工作流 + agent + HITL | suspend/resume + storage 持久化状态 + conversation/working/semantic memory | README 声明内建 evals/observability | 高 | GitHub: Other；根包: Apache-2.0 | 能力完整，集成与许可证确认成本更高 |
| `elizaOS/eliza` | 平台化 multi-agent runtime（偏“整套系统”） | 具备 agent/group/conversation 管理，但 manager API 粒度不如前两者直接 | 平台/CLI/UI 较完整 | 高 | MIT | 更像替代运行时，不是轻量嵌入式 manager 库 |

## 对 mimikit 的接入判断
- 你们当前 manager 主循环已经具备“历史截断 + prompt 注入 + provider thread”接入位点，可直接承接外部编排能力。
- 最小改造点：
  - 在 `managerLoop` 的 `runManager(...)` 前后加一层“重心状态对象（focus state）”读写与回填。
  - 用 `selectRecentHistory` 结果之外，再补一份“结构化重心快照”进入 prompt 注入区。
  - 对 provider `threadId` 做跨轮绑定，减少重建上下文成本。

## 建议落地顺序
1. `P0`（低风险）：引入 `openai-agents-js` 的 loop/handoff 思路，保留现有 orchestrator，不替换主干。
2. `P1`（增强可控）：评估 `langgraph-supervisor` 作为 manager 子图，仅接管“任务分派与重心更新”。
3. `P2`（可选）：若后续需要完整工作流平台能力，再评估 `mastra` 的 ROI 与许可证。

## 风险提示
- `mastra` 许可证来源信号不一致，必须在引入前做一次仓库级与发布包级核对。
- `langgraph-supervisor-js` 独立仓库已迁移，评估与依赖应以 `langgraphjs` monorepo 子目录为准，避免跟错仓。

## 证据索引
- 当前 mimikit 接入位点：
  - `src/manager/loop.ts:72`
  - `src/orchestrator/read-model/history-select.ts:24`
  - `src/prompts/build-prompts.ts:112`
  - `src/providers/types.ts:10`
- `openai-agents-js`（workflow/handoff/history/maxTurns/loop）：
  - `tmp/readme-eval-openai-openai-agents-js.md:24`
  - `tmp/readme-eval-openai-openai-agents-js.md:198`
  - `tmp/readme-eval-openai-openai-agents-js.md:206`
  - `tmp/readme-eval-openai-openai-agents-js.md:208`
  - `tmp/readme-eval-openai-openai-agents-js.md:37`
- `langgraphjs`（low-level orchestration、memory、HITL）：
  - `tmp/readme-eval-langchain-ai-langgraphjs.md:11`
  - `tmp/readme-eval-langchain-ai-langgraphjs.md:82`
- `langgraph-supervisor`（中心 supervisor、历史模式、memory/checkpointer）：
  - `tmp/readme-eval-langgraph-supervisor-in-mono.md:3`
  - `tmp/readme-eval-langgraph-supervisor-in-mono.md:9`
  - `tmp/readme-eval-langgraph-supervisor-in-mono.md:170`
  - `tmp/pkg-eval-langgraph-supervisor-in-mono.json:14`
  - `tmp/readme-js-final-langchain-ai-langgraph-supervisor-js.md:2`
- `mastra`（workflow、suspend/resume、context/memory）：
  - `tmp/readme-eval-mastra-ai-mastra.md:25`
  - `tmp/readme-eval-mastra-ai-mastra.md:27`
  - `tmp/readme-eval-mastra-ai-mastra.md:29`
  - `tmp/pkg-eval-mastra-ai-mastra.json:117`
  - `tmp/repo-meta-mastra.json:1`
- `eliza`（平台化 multi-agent + MIT）：
  - `tmp/readme-eval-elizaOS-eliza.md:30`
  - `tmp/readme-eval-elizaOS-eliza.md:167`
  - `tmp/readme-eval-elizaOS-eliza.md:198`
- 生态活跃度与体量（2026-02-12）：
  - `tmp/repo-meta-openai-agents-js.json:1`
  - `tmp/repo-meta-langgraphjs.json:1`
  - `tmp/repo-meta-mastra.json:1`
  - `tmp/repo-meta-eliza.json:1`
  - `tmp/repo-tree-counts.txt:1`
  - `tmp/repo-tree-counts.txt:2`
  - `tmp/repo-tree-counts.txt:3`
  - `tmp/repo-tree-counts.txt:4`
