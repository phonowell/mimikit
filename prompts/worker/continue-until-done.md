上一轮输出尚未包含完成标记，任务被判定为未完成。

继续执行同一任务，直到目标全部完成后再结束。

约束：
- 如果尚未完成，继续执行，不要提前收尾。
- 如果已完成，输出最终结果后，先追加 `{{ task_handoff_tag_pattern }}` 形态的 handoff JSON，再在最后一行追加 `<M:skill_usage status="done">实际使用的skill名称（逗号分隔）</M:skill_usage>`。
- 严禁输出“下一步再做”之类未完成结论。
- handoff 标签必须是严格 JSON，且至少包含 `summary`。
- 最后一行的标签格式必须匹配：`{{ done_tag_pattern }}`（其中标签体可替换为实际 skill 列表）。

当前轮次：{{ next_round }}/{{ max_rounds }}
上一轮输出：
{{ latest_output }}
