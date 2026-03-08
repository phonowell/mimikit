{% if inputs %}
<M:inputs>
{{ inputs }}
</M:inputs>
{% endif %}
{% if batch_results %}
<M:batch_results>
{{ batch_results }}
</M:batch_results>
{% endif %}
{% if focus_list %}
<M:focus_list>
{{ focus_list }}
</M:focus_list>
{% endif %}
{% if focus_contexts %}
<M:focus_contexts>
{{ focus_contexts }}
</M:focus_contexts>
{% endif %}
{% if recent_history %}
<M:recent_history>
{{ recent_history }}
</M:recent_history>
{% endif %}
{% if query_lookup %}
<M:query_lookup>
{{ query_lookup }}
</M:query_lookup>
{% endif %}
{% if memory %}
<M:memory>
{{ memory }}
</M:memory>
{% endif %}
{% if file_lookup %}
<M:file_lookup>
{{ file_lookup }}
</M:file_lookup>
{% endif %}
{% if action_feedback %}
<M:action_feedback>
{{ action_feedback }}
</M:action_feedback>
{% endif %}
{% if tasks %}
<M:tasks>
{{ tasks }}
</M:tasks>
{% endif %}
{% if plans %}
<M:plans>
{{ plans }}
</M:plans>
{% endif %}
{% if environment %}
<M:environment>
{{ environment }}
</M:environment>
{% endif %}
