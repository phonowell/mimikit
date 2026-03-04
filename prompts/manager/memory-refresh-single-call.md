你正在执行 memory 刷新流程的一次性单轮作业。

目标：在一次输出内完成三类工作，并给出最终可写入条目。
- Harvest（攫取）：从输入中提取候选长期记忆。
- Curate（整理）：去重、归并、冲突消解。
- Compress（压缩）：产出最小安全补丁。

输入说明（来自 `# Input(JSON)`）：
- `memoryMarkdown`：当前已有长期记忆全文。
- `signals[]`：近期可见对话信号（采样窗口，不是全量历史；`text` 可能被截断）。
- `tasks[]`：近期任务摘要（含 `id/title/status/focusId/output?`）。
- `plans[]`：近期计划摘要（含 `id/title/status/updatedAt`）。
- `compressedContext?`：可选压缩上下文摘要。

执行约束：
1. 只能基于输入 JSON 推断；禁止使用输入外事实。
2. 信息若不稳定、不可验证、一次性、或明显短期过期，不得进入 `entries`。
3. 与 `memoryMarkdown` 前后不一致并不必然是冲突；若有更晚或更强证据，可输出“更新型”条目并明确新旧关系。
4. 仅当无法判断新旧真伪、或证据强度不足以决策时，才应 `noop`。
5. `evidence_ids` 必须来自输入中真实存在的 ID（`signals.id` / `tasks.id` / `plans.id`），禁止虚构。
6. `entries` 最多 60 条；超过时按证据强度与长期价值排序裁剪。
7. 仅输出“可追加”的最小补丁，不做删除/改写既有 memory 的假设。
8. 若因采样/截断导致证据不足，宁可 `noop`，并在 `reason` 说明具体缺口。

输出要求（必须严格 JSON）：
1. 仅输出一个 JSON 对象，不要输出代码块。
2. JSON 结构：
{
  "mode": "patch" | "noop",
  "reason": "string",
  "harvest": { "mode": "patch" | "noop", "reason": "string" },
  "curate": { "mode": "patch" | "noop", "reason": "string" },
  "compress": { "mode": "patch" | "noop", "reason": "string" },
  "entries": [
    {
      "title": "string",
      "content": "string",
      "evidence_ids": ["string"]
    }
  ]
}
3. 若无可靠增量，必须输出 `mode="noop"`，并给出可审计 `reason`。
4. 三类工作都必须显式给出 `mode+reason`；不可省略。
5. `entries` 只保留长期稳定、可验证、可执行的信息；如为“更新型”信息，需在 `content` 明确新旧关系。
6. 禁止编造事实；证据不足时必须 `noop`。
7. 仅当 `entries` 非空时允许顶层 `mode="patch"`；否则必须为 `noop`。

# Input(JSON)
{{ input_json }}
