import type { Board, Idea, IdeaGroup } from '../types'

export interface RemoteIdea {
  id: number
  text: string
  group_id: number | null
  assignment_is_manual: boolean
  created_at: string
  updated_at: string
}

export interface RemoteGroup {
  id: number
  name: string
  name_is_manual: boolean
}

interface RemoteBoard {
  id: number
  title: string
  updated_at: string
  groups: RemoteGroup[]
  ideas: RemoteIdea[]
}

const palette = ['#2f6feb', '#8b3fd9', '#0e9468', '#e8620f', '#d6336c', '#7a5c00']
const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

const readErrorDetail = (body: unknown): string | null => {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string' ? [item.msg] : [])
    if (messages.length) return messages.join(' ')
  }
  return null
}

const request = async <T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    })
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '서버 응답 시간이 초과됐어요.'
      : '서버에 연결할 수 없어요.'
    throw new ApiError(message, 0)
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) {
    let message = '서버 요청을 처리하지 못했어요.'
    try {
      const detail = readErrorDetail(await response.json())
      if (detail) message = detail
    } catch {
      // Use the fallback message when the server does not return JSON.
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface ApiClient {
  loadBoard(): Promise<Board>
  createIdea(text: string): Promise<RemoteIdea>
  updateIdea(id: number, text: string): Promise<RemoteIdea>
  deleteIdea(id: number): Promise<void>
}

export const createApiClient = (baseUrl: string, boardId: number): ApiClient => {
  const base = baseUrl.replace(/\/$/, '')
  return {
    async loadBoard() {
      const remote = await request<RemoteBoard>(base, `/boards/${boardId}`)
      if (!Array.isArray(remote.groups) || !Array.isArray(remote.ideas)) throw new ApiError('서버 응답 형식이 올바르지 않아요.', 502)
      const groups: IdeaGroup[] = remote.groups.map((group, index) => ({
        id: `server-group-${group.id}`,
        serverId: group.id,
        name: group.name,
        nameIsManual: group.name_is_manual,
        color: palette[index % palette.length],
      }))
      const groupIds = new Map(groups.map((group) => [group.serverId, group.id]))
      const ideas: Idea[] = remote.ideas.map((idea) => ({
        id: `server-idea-${idea.id}`,
        serverId: idea.id,
        text: idea.text,
        groupId: idea.group_id === null ? null : groupIds.get(idea.group_id) ?? null,
        favorite: false,
        assignmentIsManual: idea.assignment_is_manual,
        createdAt: idea.created_at,
        updatedAt: idea.updated_at,
      }))
      return { id: `server-board-${remote.id}`, serverId: remote.id, title: remote.title, groups, ideas, updatedAt: remote.updated_at }
    },
    createIdea: (text) => request(base, `/boards/${boardId}/ideas`, { method: 'POST', body: JSON.stringify({ text }) }),
    updateIdea: (id, text) => request(base, `/boards/${boardId}/ideas/${id}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
    async deleteIdea(id) {
      try {
        await request(base, `/boards/${boardId}/ideas/${id}`, { method: 'DELETE' })
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return
        throw error
      }
    },
  }
}
