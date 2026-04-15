const INTERNAL_TAG_PATTERN = /<\/?M:[^>\n]*\/?>/gi

const INTERNAL_TERM_REPLACEMENTS: Array<[pattern: RegExp, value: string]> = [
  [/\benqueue_task\b/gi, '后续任务'],
  [/\bset_plan\b/gi, '后续计划'],
  [/\bdelete_plan\b/gi, '计划关闭'],
  [/\btask_control\b/gi, '任务操作'],
  [/\bremember_memory\b/gi, '长期记忆'],
  [/\bremember_project_profile\b/gi, '项目档案'],
  [/\bintent-evidence(?:\s+guard)?\b/gi, '直接授权'],
  [/\bschema\b/gi, '内部格式'],
  [/\bguard\b/gi, '门禁'],
  [/\bgoal\b/gi, '目标'],
  [/\bin_scope\b/gi, '处理范围'],
  [/\bdone_when\b/gi, '完成标准'],
  [/\bcwd\/mode\b/gi, '执行目录与模式'],
  [/\bsource_input_id\b/gi, '当前输入'],
  [/\btask id\/title\b/gi, '任务'],
]

export const normalizeSentence = (value: string): string => {
  let next = value.replace(INTERNAL_TAG_PATTERN, ' ')
  for (const [pattern, replacement] of INTERNAL_TERM_REPLACEMENTS)
    next = next.replace(pattern, replacement)
  next = next
    .replace(
      /后续任务[^。\n]*直接授权[^。\n]*内部格式[^。\n]*(?:不完整|拦住|缺失|不足)[^。\n]*[。.]?/g,
      '这一步还缺继续推进所需的直接授权和边界信息。',
    )
    .replace(
      /下一步[^。\n]*直接授权[^。\n]*内部格式[^。\n]*[。.]?/g,
      '下一步：我会在直接授权和边界信息明确后继续推进。',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([，。；：])/g, '$1')
    .trim()
  return next
}
