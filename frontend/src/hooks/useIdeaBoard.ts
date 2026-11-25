import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { boardReducer, createGroup, createIdea, getGroupColor, mergeRemoteBoard } from '../domain/board'
import { ApiError, createApiClient, type ApiClient } from '../services/api'
import { loadBoard, saveBoard } from '../services/storage'
import type { Idea, SyncState } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() as string | undefined
const configuredBoardId = Number(import.meta.env.VITE_BOARD_ID)
const hasRemoteConfiguration = Boolean(apiBaseUrl && Number.isInteger(configuredBoardId) && configuredBoardId > 0)

const makeClient = (): ApiClient | null => hasRemoteConfiguration ? createApiClient(apiBaseUrl as string, configuredBoardId) : null

interface RemoteTaskMessages {
  pending: string
  success: string
  preserved: string
  formatError?: (error: unknown) => string
}

const defaultRemoteTaskMessages: RemoteTaskMessages = {
  pending: '서버에 저장하는 중…',
  success: '서버와 동기화됐습니다.',
  preserved: '로컬 변경은 보존했습니다.',
}

export const useIdeaBoard = () => {
  const [board, dispatch] = useReducer(boardReducer, undefined, loadBoard)
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [analyzing, setAnalyzing] = useState(false)
  const [syncMessage, setSyncMessage] = useState(hasRemoteConfiguration ? '서버 연결이 설정됐습니다. 필요할 때 최신 데이터를 불러오세요.' : '이 브라우저에 자동 저장됩니다.')
  const client = useMemo(() => makeClient(), [])
  const pendingIdeaCreates = useRef(new Map<string, Promise<number>>())
  const syncBatch = useRef({ active: 0, failed: false, errorMessage: '' })
  const boardRef = useRef(board)
  const analyzingRef = useRef(false)

  useEffect(() => { boardRef.current = board }, [board])

  useEffect(() => {
    for (const idea of board.ideas) {
      if (idea.serverId !== undefined) pendingIdeaCreates.current.delete(idea.id)
    }
  }, [board.ideas])

  useEffect(() => {
    try {
      saveBoard(board)
    } catch {
      const messageTimer = window.setTimeout(() => {
        setSyncState('error')
        setSyncMessage('브라우저 저장 공간에 기록하지 못했어요. 중요한 내용을 복사해 두고 저장 공간을 확인해 주세요.')
      }, 0)
      return () => window.clearTimeout(messageTimer)
    }
  }, [board])

  const remoteTask = useCallback(async (
    task: (api: ApiClient) => Promise<void>,
    messages: RemoteTaskMessages = defaultRemoteTaskMessages,
  ): Promise<boolean> => {
    if (!client) return true
    const batch = syncBatch.current
    if (batch.active === 0) {
      batch.failed = false
      batch.errorMessage = ''
    }
    batch.active += 1
    setSyncState('syncing')
    setSyncMessage(messages.pending)
    let succeeded = true
    try {
      await task(client)
    } catch (error) {
      succeeded = false
      batch.failed = true
      batch.errorMessage = messages.formatError?.(error)
        ?? (error instanceof Error ? `${error.message} ${messages.preserved}` : `서버 요청에 실패했지만 ${messages.preserved}`)
    } finally {
      batch.active -= 1
      if (batch.active === 0) {
        if (batch.failed) {
          setSyncState('error')
          setSyncMessage(batch.errorMessage)
        } else {
          setSyncState('synced')
          setSyncMessage(messages.success)
        }
      }
    }
    return succeeded
  }, [client])

  const addIdeas = useCallback(async (texts: string[]) => {
    if (analyzingRef.current) return
    const ideas = texts.map((text) => createIdea(text))
    dispatch({ type: 'ideas/add', ideas })
    await remoteTask(async (api) => {
      const requests = ideas.map((idea) => {
        const request = api.createIdea(idea.text).then((remote) => {
          dispatch({ type: 'idea/link-server', id: idea.id, serverId: remote.id })
          return remote.id
        })
        pendingIdeaCreates.current.set(idea.id, request)
        return request
      })
      const results = await Promise.allSettled(requests)
      results.forEach((result, index) => {
        if (result.status === 'rejected') pendingIdeaCreates.current.delete(ideas[index].id)
      })
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failure) throw failure.reason
    })
  }, [remoteTask])

  const updateIdea = useCallback(async (idea: Idea, text: string) => {
    if (analyzingRef.current) return
    dispatch({ type: 'idea/update', id: idea.id, text })
    await remoteTask(async (api) => {
      const pendingServerId = pendingIdeaCreates.current.get(idea.id)
      const serverId = idea.serverId ?? (pendingServerId ? await pendingServerId : undefined)
      if (serverId) await api.updateIdea(serverId, text.trim())
      else {
        const remote = await api.createIdea(text.trim())
        pendingIdeaCreates.current.set(idea.id, Promise.resolve(remote.id))
        dispatch({ type: 'idea/link-server', id: idea.id, serverId: remote.id })
      }
    })
  }, [remoteTask])

  const deleteIdea = useCallback(async (idea: Idea) => {
    if (analyzingRef.current) return
    const originalIndex = boardRef.current.ideas.findIndex((item) => item.id === idea.id)
    dispatch({ type: 'idea/delete', id: idea.id })
    const deleted = await remoteTask(async (api) => {
      const pendingServerId = pendingIdeaCreates.current.get(idea.id)
      const serverId = idea.serverId ?? (pendingServerId ? await pendingServerId : undefined)
      if (serverId) await api.deleteIdea(serverId)
      pendingIdeaCreates.current.delete(idea.id)
    })
    if (!deleted && originalIndex >= 0) {
      dispatch({ type: 'idea/restore', idea, index: originalIndex })
      setSyncMessage('서버 삭제에 실패해 카드를 원래 위치로 복구했습니다.')
    }
  }, [remoteTask])

  const toggleFavorite = useCallback((id: string) => dispatch({ type: 'idea/favorite', id }), [])

  const moveIdea = useCallback(async (idea: Idea, groupId: string | null) => {
    if (analyzingRef.current) return
    const currentBoard = boardRef.current
    const targetGroup = currentBoard.groups.find((group) => group.id === groupId)
    if (!client || (groupId !== null && targetGroup?.serverId === undefined)) {
      dispatch({ type: 'idea/move', id: idea.id, groupId })
      if (client) {
        setSyncState('local')
        setSyncMessage('로컬 그룹 배치는 이 브라우저에 보존됩니다.')
      }
      return
    }
    await remoteTask(async (api) => {
      const pendingServerId = pendingIdeaCreates.current.get(idea.id)
      const serverId = idea.serverId ?? (pendingServerId ? await pendingServerId : undefined)
      if (!serverId) throw new Error('카드가 아직 서버에 저장되지 않았어요.')
      await api.moveIdea(serverId, targetGroup?.serverId ?? null)
      dispatch({ type: 'idea/move', id: idea.id, groupId })
    })
  }, [client, remoteTask])

  const addGroup = useCallback(async (name: string) => {
    if (analyzingRef.current) return false
    if (!client) {
      dispatch({ type: 'group/add', group: createGroup(name, boardRef.current.groups.length) })
      return true
    }
    return remoteTask(async (api) => {
      const remote = await api.createGroup(name.trim())
      dispatch({
        type: 'group/add',
        group: {
          id: `server-group-${remote.id}`,
          serverId: remote.id,
          name: remote.name,
          nameIsManual: remote.name_is_manual,
          color: getGroupColor(boardRef.current.groups.length),
        },
      })
    }, {
      pending: '새 그룹을 서버에 만드는 중…',
      success: '새 그룹을 서버에 저장했습니다.',
      preserved: '입력한 이름으로 다시 시도해 주세요.',
    })
  }, [client, remoteTask])

  const renameGroup = useCallback(async (groupId: string, name: string): Promise<boolean> => {
    if (analyzingRef.current) return false
    const group = boardRef.current.groups.find((item) => item.id === groupId)
    if (!group) {
      setSyncState('error')
      setSyncMessage('수정할 그룹을 찾을 수 없어요.')
      return false
    }
    if (!client || group.serverId === undefined) {
      dispatch({ type: 'group/rename', id: groupId, name })
      if (client) {
        setSyncState('local')
        setSyncMessage('로컬 그룹 이름은 이 브라우저에 보존됩니다.')
      }
      return true
    }
    const serverId = group.serverId
    return remoteTask(async (api) => {
      await api.renameGroup(serverId, name.trim())
      dispatch({ type: 'group/rename', id: groupId, name })
    })
  }, [client, remoteTask])

  const analyzeBoard = useCallback(async () => {
    if (!client || analyzingRef.current) return false
    analyzingRef.current = true
    setAnalyzing(true)
    try {
      return await remoteTask(async (api) => {
        await Promise.all([...pendingIdeaCreates.current.values()])
        const analyzed = await api.analyzeBoard()
        dispatch({ type: 'hydrate', board: mergeRemoteBoard(analyzed, boardRef.current) })
      }, {
        pending: '아이디어를 분석하는 중…',
        success: '분석 결과를 저장하고 화면에 반영했습니다.',
        preserved: '기존 화면은 그대로 유지했습니다.',
        formatError: (error) => error instanceof ApiError && error.status === 409
          ? '분석 중 보드가 변경됐어요. 서버에서 새로고침한 뒤 다시 분석해 주세요. 기존 화면은 그대로 유지했습니다.'
          : error instanceof Error
            ? `${error.message} 기존 화면은 그대로 유지했습니다.`
            : '분석에 실패했습니다. 기존 화면은 그대로 유지했습니다.',
      })
    } finally {
      analyzingRef.current = false
      setAnalyzing(false)
    }
  }, [client, remoteTask])

  const reloadRemote = useCallback(async () => {
    if (!client) return
    await remoteTask(async (api) => {
      const remote = await api.loadBoard()
      dispatch({ type: 'hydrate', board: mergeRemoteBoard(remote, boardRef.current) })
    }, {
      pending: '서버 데이터를 불러오는 중…',
      success: '서버의 최신 보드를 불러왔습니다.',
      preserved: '기존 화면은 그대로 유지했습니다.',
    })
  }, [client, remoteTask])

  return { board, syncState, syncMessage, remoteEnabled: Boolean(client), analyzing, addIdeas, updateIdea, deleteIdea, toggleFavorite, moveIdea, addGroup, renameGroup, analyzeBoard, reloadRemote }
}
