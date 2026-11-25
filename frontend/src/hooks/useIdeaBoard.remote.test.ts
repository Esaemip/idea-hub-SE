import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('useIdeaBoard remote synchronization', () => {
  const serverBoard = {
    id: 'server-board-1', serverId: 1, title: '보드', updatedAt: '2026-11-25T00:00:00.000Z',
    groups: [{ id: 'server-group-4', serverId: 4, name: '저장 그룹', nameIsManual: false, color: '#2f6feb' }],
    ideas: [{ id: 'server-idea-7', serverId: 7, text: '서버 카드', groupId: null, favorite: false, assignmentIsManual: false, createdAt: '2026-11-25T00:00:00.000Z', updatedAt: '2026-11-25T00:00:00.000Z' }],
  }

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

  it('restores a server card when deletion fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    localStorage.setItem('idea-hub.board.v1', JSON.stringify({
      id: 'server-board-1', serverId: 1, title: '보드', updatedAt: '2026-11-25T00:00:00.000Z', groups: [],
      ideas: [{ id: 'server-idea-7', serverId: 7, text: '삭제 실패 카드', groupId: null, favorite: false, assignmentIsManual: false, createdAt: '2026-11-25T00:00:00.000Z', updatedAt: '2026-11-25T00:00:00.000Z' }],
    }))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'))
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())
    const idea = result.current.board.ideas[0]

    await act(async () => { await result.current.deleteIdea(idea) })

    expect(result.current.board.ideas).toContainEqual(idea)
    expect(result.current.syncState).toBe('error')
    expect(result.current.syncMessage).toBe('서버 삭제에 실패해 카드를 원래 위치로 복구했습니다.')
  })

  it('keeps the error state when one of concurrent sync requests fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    let failFirst!: (reason: Error) => void
    let finishSecond!: (response: Response) => void
    const firstResponse = new Promise<Response>((_resolve, reject) => { failFirst = reject })
    const secondResponse = new Promise<Response>((resolve) => { finishSecond = resolve })
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => firstResponse)
      .mockImplementationOnce(async () => secondResponse)
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    let firstRequest!: Promise<void>
    let secondRequest!: Promise<void>
    act(() => {
      firstRequest = result.current.addIdeas(['실패할 카드'])
      secondRequest = result.current.addIdeas(['성공할 카드'])
    })
    await act(async () => {
      failFirst(new TypeError('network down'))
      await firstRequest
    })
    expect(result.current.syncState).toBe('syncing')

    await act(async () => {
      finishSecond(new Response(JSON.stringify({ id: 10, text: '성공할 카드' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      await secondRequest
    })

    expect(result.current.syncState).toBe('error')
    expect(result.current.syncMessage).toContain('서버에 연결할 수 없어요.')
  })

  it('shows analysis results but preserves the current screen when analysis fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    localStorage.setItem('idea-hub.board.v1', JSON.stringify(serverBoard))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1, title: '보드', updated_at: '2026-11-25T01:00:00.000Z',
        groups: [{ id: 4, name: '저장 그룹', name_is_manual: false }, { id: 5, name: 'AI 그룹', name_is_manual: false }],
        ideas: [{ id: 7, text: '서버 카드', group_id: 5, assignment_is_manual: false, created_at: '2026-11-25T00:00:00.000Z', updated_at: '2026-11-25T00:00:00.000Z' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    const before = result.current.board
    await act(async () => { await result.current.analyzeBoard() })
    expect(result.current.board).toEqual(before)
    expect(result.current.syncMessage).toContain('기존 화면은 그대로 유지했습니다.')

    await act(async () => { await result.current.analyzeBoard() })
    expect(result.current.board.groups).toContainEqual(expect.objectContaining({ serverId: 5, name: 'AI 그룹' }))
    expect(result.current.board.ideas[0].groupId).toBe('server-group-5')
    expect(result.current.syncMessage).toContain('분석 결과를 저장')
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'POST')).toBe(true)
  })

  it('explains how to recover from a 409 analysis conflict', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    localStorage.setItem('idea-hub.board.v1', JSON.stringify(serverBoard))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: '분석 중 보드가 변경되었습니다. 다시 분석해 주세요' }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())
    const before = result.current.board

    await act(async () => { await result.current.analyzeBoard() })

    expect(result.current.board).toEqual(before)
    expect(result.current.syncState).toBe('error')
    expect(result.current.syncMessage).toBe('분석 중 보드가 변경됐어요. 서버에서 새로고침한 뒤 다시 분석해 주세요. 기존 화면은 그대로 유지했습니다.')
  })

  it('waits for a pending card create before requesting analysis', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    let finishCreate!: (response: Response) => void
    let analysisRequested = false
    const createResponse = new Promise<Response>((resolve) => { finishCreate = resolve })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/ideas')) return createResponse
      if (url.endsWith('/analyze')) {
        analysisRequested = true
        return new Response(JSON.stringify({
          id: 1, title: '보드', updated_at: '2026-11-25T01:00:00.000Z', groups: [],
          ideas: [{ id: 9, text: '방금 추가한 카드', group_id: null, assignment_is_manual: false, created_at: '2026-11-25T00:00:00.000Z', updated_at: '2026-11-25T00:00:00.000Z' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`unexpected URL: ${url}`)
    })
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    let addRequest!: Promise<void>
    let analyzeRequest!: Promise<boolean>
    act(() => { addRequest = result.current.addIdeas(['방금 추가한 카드']) })
    await waitFor(() => expect(result.current.board.ideas.some((idea) => idea.text === '방금 추가한 카드')).toBe(true))
    act(() => { analyzeRequest = result.current.analyzeBoard() })
    await Promise.resolve()
    expect(analysisRequested).toBe(false)

    await act(async () => {
      finishCreate(new Response(JSON.stringify({ id: 9, text: '방금 추가한 카드' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      await Promise.all([addRequest, analyzeRequest])
    })

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'http://localhost:8000/boards/1/ideas',
      'http://localhost:8000/boards/1/analyze',
    ])
    expect(result.current.board.ideas).toContainEqual(expect.objectContaining({ serverId: 9, text: '방금 추가한 카드' }))
  })

  it('merges a delayed reload response with the latest local state', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    localStorage.setItem('idea-hub.board.v1', JSON.stringify(serverBoard))
    let finishReload!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Promise<Response>((resolve) => { finishReload = resolve }))
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    let reloadRequest!: Promise<void>
    act(() => { reloadRequest = result.current.reloadRemote() })
    act(() => { result.current.toggleFavorite('server-idea-7') })
    await act(async () => {
      finishReload(new Response(JSON.stringify({
        id: 1, title: '보드', updated_at: '2026-11-25T01:00:00.000Z', groups: [{ id: 4, name: '저장 그룹', name_is_manual: false }],
        ideas: [{ id: 7, text: '서버 카드', group_id: null, assignment_is_manual: false, created_at: '2026-11-25T00:00:00.000Z', updated_at: '2026-11-25T00:00:00.000Z' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      await reloadRequest
    })

    expect(result.current.board.ideas[0].favorite).toBe(true)
  })

  it('keeps B3 group rename and card movement after a reload', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    localStorage.setItem('idea-hub.board.v1', JSON.stringify(serverBoard))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/groups/4') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 4, name: '변경 그룹', name_is_manual: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/ideas/7/group') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 7, text: '서버 카드', group_id: 4, assignment_is_manual: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/boards/1') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          id: 1, title: '보드', updated_at: '2026-11-25T01:00:00.000Z',
          groups: [{ id: 4, name: '변경 그룹', name_is_manual: true }],
          ideas: [{ id: 7, text: '서버 카드', group_id: 4, assignment_is_manual: true, created_at: '2026-11-25T00:00:00.000Z', updated_at: '2026-11-25T01:00:00.000Z' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`)
    })
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    let persistedRenamed!: boolean
    await act(async () => { persistedRenamed = await result.current.renameGroup('server-group-4', '변경 그룹') })
    await act(async () => { await result.current.moveIdea(result.current.board.ideas[0], 'server-group-4') })
    await act(async () => { await result.current.reloadRemote() })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/boards/1/groups/4', expect.objectContaining({ method: 'PATCH' }))
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/boards/1/ideas/7/group', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ group_id: 4 }) }))
    expect(result.current.board.groups[0]).toMatchObject({ name: '변경 그룹', nameIsManual: true })
    expect(result.current.board.ideas[0]).toMatchObject({ groupId: 'server-group-4', assignmentIsManual: true })
    expect(persistedRenamed).toBe(true)
  })

  it('creates a group through B3 and keeps it after a reload', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    localStorage.setItem('idea-hub.board.v1', JSON.stringify({ ...serverBoard, groups: [] }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/groups') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 6, name: '새 서버 그룹', name_is_manual: true }), { status: 201, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/boards/1') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          id: 1, title: '보드', updated_at: '2026-11-25T01:00:00.000Z',
          groups: [{ id: 6, name: '새 서버 그룹', name_is_manual: true }],
          ideas: [{ id: 7, text: '서버 카드', group_id: null, assignment_is_manual: false, created_at: '2026-11-25T00:00:00.000Z', updated_at: '2026-11-25T00:00:00.000Z' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`)
    })
    const { useIdeaBoard } = await import('./useIdeaBoard')
    const { result } = renderHook(() => useIdeaBoard())

    let created!: boolean
    await act(async () => { created = await result.current.addGroup('새 서버 그룹') })
    expect(result.current.board.groups).toContainEqual(expect.objectContaining({ serverId: 6, name: '새 서버 그룹', nameIsManual: true }))
    await act(async () => { await result.current.reloadRemote() })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/boards/1/groups', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '새 서버 그룹' }) }))
    expect(result.current.board.groups).toHaveLength(1)
    expect(result.current.board.groups[0]).toMatchObject({ serverId: 6, name: '새 서버 그룹' })
    expect(created).toBe(true)
  })
})
