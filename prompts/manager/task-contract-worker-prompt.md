body: |
  {% if title %}{{ title_label }}{{ title }}
  {% endif %}目标：{{ goal }}
  执行范围：{{ in_scope }}
  {% if out_of_scope %}{{ out_of_scope_label }}{{ out_of_scope }}
  {% endif %}{% if context_refs %}{{ context_refs_label }}{{ context_refs }}
  {% endif %}完成标准：
  {{ done_when_block }}{% if extra_instructions_block %}

  {{ extra_instructions_heading }}
  {{ extra_instructions_block }}{% endif %}
title_label: 任务标题：
out_of_scope_label: 不做：
context_refs_label: 上下文引用：
extra_instructions_heading: 补充说明：
