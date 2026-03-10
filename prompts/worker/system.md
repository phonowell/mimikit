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
