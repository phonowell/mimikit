export const tellerOutputSchema = {
  type: 'object',
  properties: {
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            enum: [
              'reply',
              'delegate',
              'ask_user',
              'remember',
              'list_tasks',
              'cancel_task',
            ],
          },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['tool', 'args'],
        additionalProperties: false,
      },
    },
  },
  required: ['tool_calls'],
  additionalProperties: false,
} as const

export const plannerOutputSchema = {
  type: 'object',
  properties: {
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            enum: [
              'delegate',
              'schedule',
              'get_recent_history',
              'get_history_by_time',
              'search_memory',
              'list_tasks',
              'cancel_task',
            ],
          },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['tool', 'args'],
        additionalProperties: false,
      },
    },
    result: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['done', 'needs_input', 'failed'] },
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        default: { type: 'string' },
        error: { type: 'string' },
        tasks: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        triggers: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
      required: ['status'],
      additionalProperties: true,
    },
  },
  required: ['result'],
  additionalProperties: false,
} as const
