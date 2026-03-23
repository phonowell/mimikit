{% include "worker/windsurf.md" %}

// 任务描述：
<M:prompt>
{{ prompt }}
</M:prompt>

{% if focus_brief %}
// 任务相关 focus brief；供参考，不主动提及
<M:focus_brief>
{{ focus_brief }}
</M:focus_brief>
{% endif %}

// 环境信息；供参考，不主动提及
<M:environment>
{{ environment }}
</M:environment>

// 完成输出协议：
// 1. 未完成时继续执行，不要提前收尾。
// 2. 已完成时，先输出给人看的最终结果。
// 3. 然后追加 `<M:task_handoff>...</M:task_handoff>`，其中必须是严格 JSON。
// 4. JSON 至少包含 `summary`；可选字段：`decisions[]`、`next_steps[]`、`risks[]`、`artifacts[]`、`evidence[]`、`git_lifecycle`。
// 5. `artifacts[]` 项格式：`{ "path": "..." , "kind"?: "...", "note"?: "..." }`
// 6. `evidence[]` 项格式：`{ "type": "file|history|task_archive", "ref": "...", "note"?: "..." }`
// 7. `git_lifecycle` 可选字段：`review{passed,at?,sha?}`、`merged`、`cleaned`
// 8. 最后一行必须输出 `<M:skill_usage status="done">...</M:skill_usage>`。
