import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { boardReducer, createGroup, createIdea, mergeRemoteBoard } from '../domain/board'
import { createApiClient, type ApiClient } from '../services/api'
import { loadBoard, saveBoard } from '../services/storage'
import type { Idea, SyncState } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() as string | undefined
const configuredBoardId = Number(import.meta.env.VITE_BOARD_ID)
const hasRemoteConfiguration = Boolean(apiBaseUrl && Number.isInteger(configuredBoardId) && configuredBoardId > 0)

const makeClient = (): ApiClient | null => hasRemoteConfiguration ? createApiClient(apiBaseUrl as string, configuredBoardId) : null

export const useIdeaBoard = () => {
  const [board, dispatch] = useReducer(boardReducer, undefined, loadBoard)
  const [syncState, setSyncState] = useState<SyncState>('local')
  const [syncMessage, setSyncMessage] = useState(hasRemoteConfiguration ? '서버 연결이 설정됐습니다. 필요할 때 최신 데이터를 불러오세요.' : '이 브라우저에 자동 저장됩니다.')
  const client = useMemo(() => makeClient(), [])
  const pendingIdeaCreates = useRef(new Map<string, Promise<number>>())
  const syncBatch = useRef({ active: 0, failed: false, errorMessage: '' })

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

  const remoteTask = useCallback(async (task: (api: ApiClient) => Promise<void>): Promise<boolean> => {
    if (!client) return true
    const batch = syncBatch.current
    if (batch.active === 0) {
      batch.failed = false
      batch.errorMessage = ''
    }
    batch.active += 1
    setSyncState('syncing')
    setSyncMessage('서버에 저장하는 중…')
    let succeeded = true
    try {
      await task(client)
    } catch (error) {
      succeeded = false
      batch.failed = true
      batch.errorMessage = error instanceof Error ? `${error.message} 로컬 변경은 보존했습니다.` : '서버 저장에 실패했지만 로컬 변경은 보존했습니다.'
    } finally {
      batch.active -= 1
      if (batch.active === 0) {
        if (batch.failed) {
          setSyncState('error')
          setSyncMessage(batch.errorMessage)
        } else {
          setSyncState('synced')
          setSyncMessage('서버와 동기화됐습니다.')
        }
      }
    }
    return succeeded
  }, [client])

  const addIdeas = useCallback(async (texts: string[]) => {
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
    const originalIndex = board.ideas.findIndex((item) => item.id === idea.id)
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
  }, [board.ideas, remoteTask])

  const toggleFavorite = useCallback((id: string) => dispatch({ type: 'idea/favorite', id }), [])

  const moveIdea = useCallback(async (idea: Idea, groupId: string | null) => {
    dispatch({ type: 'idea/move', id: idea.id, groupId })
    if (client) {
      setSyncState('local')
      setSyncMessage('그룹 배치는 그룹 API가 연결될 때까지 이 브라우저에 보존됩니다.')
    }
  }, [client])

  const addGroup = useCallback(async (name: string) => {
    const group = createGroup(name, board.groups.length)
    dispatch({ type: 'group/add', group })
    if (client) {
      setSyncState('local')
      setSyncMessage('새 그룹은 그룹 API가 연결될 때까지 이 브라우저에 보존됩니다.')
    }
  }, [board.groups.length, client])

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    dispatch({ type: 'group/rename', id: groupId, name })
    if (client) {
      setSyncState('local')
      setSyncMessage('그룹 이름은 그룹 API가 연결될 때까지 이 브라우저에 보존됩니다.')
    }
  }, [client])

  const reloadRemote = useCallback(async () => {
    if (!client) return
    setSyncState('syncing')
    setSyncMessage('서버 데이터를 불러오는 중…')
    try {
      const remote = await client.loadBoard()
      dispatch({ type: 'hydrate', board: mergeRemoteBoard(remote, board) })
      setSyncState('synced')
      setSyncMessage('서버의 최신 보드를 불러왔습니다.')
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? error.message : '서버 데이터를 불러오지 못했습니다.')
    }
  }, [board, client])

  return { board, syncState, syncMessage, remoteEnabled: Boolean(client), addIdeas, updateIdea, deleteIdea, toggleFavorite, moveIdea, addGroup, renameGroup, reloadRemote }
}
