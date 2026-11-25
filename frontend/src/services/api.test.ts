import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api'

afterEach(() => vi.restoreAllMocks())

describe('createApiClient', () => {
  it('uses the agreed card CRUD endpoint and payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 7, text: '새 카드' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    await createApiClient('http://localhost:8000/', 3).createIdea('새 카드')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/boards/3/ideas', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: '새 카드' }) }))
  })
  it('maps persisted analysis groups and keeps null cards unclassified', async () => {
    const response = {
      id: 3, title: '분석 보드', updated_at: '2026-11-25T01:00:00Z',
      groups: [{ id: 5, name: 'AI 그룹', name_is_manual: false }],
      ideas: [
        { id: 7, text: '분석 카드', group_id: 5, assignment_is_manual: false, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' },
        { id: 8, text: '미분류 카드', group_id: null, assignment_is_manual: false, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' },
      ],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const board = await createApiClient('http://localhost:8000', 3).analyzeBoard()

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/boards/3/analyze', expect.objectContaining({ method: 'POST', body: '{}' }))
    expect(board.groups[0]).toMatchObject({ id: 'server-group-5', serverId: 5 })
    expect(board.ideas[0].groupId).toBe('server-group-5')
    expect(board.ideas[1].groupId).toBeNull()
  })
  it('uses the B3 group rename and card move contracts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 4, name: '변경', name_is_manual: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, group_id: 4 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const api = createApiClient('http://localhost:8000', 3)

    await api.renameGroup(4, '변경')
    await api.moveIdea(7, 4)

    expect(fetchMock.mock.calls[0]).toEqual(['http://localhost:8000/boards/3/groups/4', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: '변경' }) })])
    expect(fetchMock.mock.calls[1]).toEqual(['http://localhost:8000/boards/3/ideas/7/group', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ group_id: 4 }) })])
  })
  it('rejects invalid non-positive group IDs before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const api = createApiClient('http://localhost:8000', 3)

    await expect(api.renameGroup(-1, '변경 금지')).rejects.toEqual(new ApiError('저장된 그룹 ID가 올바르지 않아요.', 400))
    await expect(api.moveIdea(7, -1)).rejects.toEqual(new ApiError('이동할 그룹 ID가 올바르지 않아요.', 400))
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('surfaces the server detail message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: '아이디어를 찾을 수 없습니다.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    await expect(createApiClient('http://localhost:8000', 1).updateIdea(99, '수정')).rejects.toEqual(new ApiError('아이디어를 찾을 수 없습니다.', 404))
  })
  it('turns connection failures into a readable error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'))
    await expect(createApiClient('http://localhost:8000', 1).loadBoard()).rejects.toEqual(new ApiError('서버에 연결할 수 없어요.', 0))
  })
  it('rejects malformed board responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 1, title: '보드', groups: null, ideas: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await expect(createApiClient('http://localhost:8000', 1).loadBoard()).rejects.toEqual(new ApiError('서버 응답 형식이 올바르지 않아요.', 502))
  })
  it('rejects malformed nested analysis data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 1, title: '보드', updated_at: '2026-11-25T00:00:00Z', groups: [{ id: 5, name: 'AI 그룹', name_is_manual: false }],
      ideas: [{ id: 7, text: '카드', group_id: 5, assignment_is_manual: 'false', created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T00:00:00Z' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(createApiClient('http://localhost:8000', 1).analyzeBoard()).rejects.toEqual(new ApiError('서버 응답 형식이 올바르지 않아요.', 502))
  })
  it('extracts readable FastAPI validation messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: [{ type: 'string_too_short', loc: ['body', 'text'], msg: 'String should have at least 1 character' }] }), { status: 422, headers: { 'Content-Type': 'application/json' } }))
    await expect(createApiClient('http://localhost:8000', 1).createIdea('')).rejects.toEqual(new ApiError('String should have at least 1 character', 422))
  })
  it('treats deleting an already removed card as successful', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: '아이디어를 찾을 수 없습니다.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    await expect(createApiClient('http://localhost:8000', 1).deleteIdea(99)).resolves.toBeUndefined()
  })
})
