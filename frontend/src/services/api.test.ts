import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api'

afterEach(() => vi.restoreAllMocks())

describe('createApiClient', () => {
  it('uses the agreed card CRUD endpoint and payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 7, text: '새 카드' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    await createApiClient('http://localhost:8000/', 3).createIdea('새 카드')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/boards/3/ideas', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: '새 카드' }) }))
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
  it('extracts readable FastAPI validation messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: [{ type: 'string_too_short', loc: ['body', 'text'], msg: 'String should have at least 1 character' }] }), { status: 422, headers: { 'Content-Type': 'application/json' } }))
    await expect(createApiClient('http://localhost:8000', 1).createIdea('')).rejects.toEqual(new ApiError('String should have at least 1 character', 422))
  })
  it('treats deleting an already removed card as successful', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: '아이디어를 찾을 수 없습니다.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    await expect(createApiClient('http://localhost:8000', 1).deleteIdea(99)).resolves.toBeUndefined()
  })
})
