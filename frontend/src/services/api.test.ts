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
})
