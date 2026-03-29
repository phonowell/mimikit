这轮编排出了点问题，但我已保留你刚才的输入。
{% if pending_result_count != '0' %}
已有 {{ pending_result_count }} 条任务结果待回放，恢复后我会继续收口。
{% elif auto_retry_state == 'exhausted' %}
这次是临时性失败重试后仍未收口；你可以稍后重试，也可以直接继续发下一句。
{% else %}
你可以稍后重试，也可以直接继续发下一句。
{% endif %}
