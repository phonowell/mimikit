这轮编排出了点问题，但我已保留你刚才的输入和当前上下文，不会把日常跟进责任直接退回给你。
{% if pending_result_count != '0' %}
已有 {{ pending_result_count }} 条任务结果待回放，恢复后我会继续推进并收口。
{% elif auto_retry_state == 'exhausted' %}
这次是临时性失败重试后仍未收口；若没有新的高风险决策需求，我恢复后会继续尝试推进。
{% else %}
若没有新的高风险决策需求，我恢复后会继续尝试推进。
{% endif %}
