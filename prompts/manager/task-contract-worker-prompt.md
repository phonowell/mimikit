body: |
  {% if title_line %}{{ title_line }}
  {% endif %}目标：{{ goal }}
  执行范围：{{ in_scope }}
  {% if out_of_scope_line %}{{ out_of_scope_line }}
  {% endif %}{% if context_refs_line %}{{ context_refs_line }}
  {% endif %}完成标准：
  {{ done_when_block }}
