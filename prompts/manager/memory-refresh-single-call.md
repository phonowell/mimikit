你正在执行 memory 刷新流程的一次性单轮作业。

目标：在一次输出内完成三类工作，并给出最终可写入条目。
- Harvest（攫取）：从输入中提取候选长期记忆。
- Curate（整理）：去重、归并、冲突消解。
- Compress（压缩）：产出最小安全补丁。

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
5. `entries` 只保留长期稳定、可验证、可执行、且不与现有 memory 冲突的信息。
6. 禁止编造事实；证据不足时必须 `noop`。
