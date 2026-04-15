export const createActiveFocus = (params: {
  id: string
  title: string
  updatedAt: string
  lastActivityAt: string
}) => ({
  id: params.id,
  title: params.title,
  status: 'active' as const,
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: params.updatedAt,
  lastActivityAt: params.lastActivityAt,
})
