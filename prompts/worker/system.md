{% include "worker/windsurf.md" %}

// 任务描述：
<M:prompt>
{{ prompt }}
</M:prompt>

{% if focus_context %}
// 任务相关 focus 摘要；供参考，不主动提及
<M:focus_context>
{{ focus_context }}
</M:focus_context>
{% endif %}

// 环境信息；供参考，不主动提及
<M:environment>
{{ environment }}
</M:environment>
