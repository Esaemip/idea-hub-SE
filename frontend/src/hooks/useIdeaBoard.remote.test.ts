import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('useIdeaBoard remote synchronization', () => {
  it('waits for a pending create before updating the same card', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()

    let finishCreate!: (response: Response) => void
    const createResponse = new Promise<Response>((resolve) => { finishCreate = resolve })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') return createResponse
      if (init?.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 9, text: '바로 수정한 카드' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`unexpected method: ${init?.method}`)
    })
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    let addRequest!: Promise<void>
    act(() => { addRequest = result.current.addIdeas(['생성 중인 카드']) })
    await waitFor(() => expect(result.current.board.ideas.some((idea) => idea.text === '생성 중인 카드')).toBe(true))
    const pendingIdea = result.current.board.ideas.find((idea) => idea.text === '생성 중인 카드')!

    let updateRequest!: Promise<void>
    act(() => { updateRequest = result.current.updateIdea(pendingIdea, '바로 수정한 카드') })
    await act(async () => {
      finishCreate(new Response(JSON.stringify({ id: 9, text: '생성 중인 카드' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      await Promise.all([addRequest, updateRequest])
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PATCH'])
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/boards/1/ideas/9')
  })
})
