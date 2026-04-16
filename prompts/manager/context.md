{% if state_packet %}
<M:state_packet>
{{ state_packet }}
</M:state_packet>
{% endif %}
{% if event_packet %}
<M:event_packet>
{{ event_packet }}
</M:event_packet>
{% endif %}
{% if remembered_memory %}
<M:remembered_memory>
{{ remembered_memory }}
</M:remembered_memory>
{% endif %}
{% if memory %}
<M:memory>
{{ memory }}
</M:memory>
{% endif %}
