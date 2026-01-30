const NOISE_PATTERNS = [
  /^#+\s*(AGENTS?\.md|CLAUDE\.md|environment_context)/im,
  /```(agents?|environment|context)[\s\S]*?```/gi,
  /<(environment|agents|context)>[\s\S]*?<\/\1>/gi,
  /(?:^|\r?\n)##\s*(Environment|Context|Agents?)[\s\S]*?(?=\r?\n##|$)/gi,
]

export const cleanUserInput = (text: string): string => {
  let cleaned = text
  for (const pattern of NOISE_PATTERNS) cleaned = cleaned.replace(pattern, '')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  return cleaned.trim()
}

export const shouldIncludeStateDir = (inputs: { text: string }[]): boolean => {
  const text = inputs.map((i) => i.text.toLowerCase()).join(' ')
  if (!text) return false
  const keywords = [
    'pending_tasks',
    'task_results',
    'agent_state',
    'chat_history',
    'task log',
    'tasks.md',
    '.mimikit',
    'state dir',
    'state directory',
    'statedir',
  ]
  return keywords.some((keyword) => text.includes(keyword))
}
