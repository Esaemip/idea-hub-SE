import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { boardReducer, createGroup, createIdea } from '../domain/board'
import { createApiClient, type ApiClient } from '../services/api'
import { loadBoard, saveBoard } from '../services/storage'
import type { Idea, SyncState } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() as string | undefined
const configuredBoardId = Number(import.meta.env.VITE_BOARD_ID)
const hasRemoteConfiguration = Boolean(apiBaseUrl && Number.isInteger(configuredBoardId) && configuredBoardId > 0)

const makeClient = (): ApiClient | null => hasRemoteConfiguration ? createApiClient(apiBaseUrl as string, configuredBoardId) : null

export const useIdeaBoard = () => {
  const [board, dispatch] = useReducer(boardReducer, undefined, loadBoard)
  const [syncState, setSyncState] = useState<SyncState>(hasRemoteConfiguration ? 'synced' : 'local')
  const [syncMessage, setSyncMessage] = useState('이 브라우저에 자동 저장됩니다.')
  const client = useMemo(makeClient, [])

  useEffect(() => { saveBoard(board) }, [board])

  const remoteTask = useCallback(async (task: (api: ApiClient) => Promise<void>) => {
    if (!client) return
    setSyncState('syncing')
    setSyncMessage('서버에 저장하는 중…')
    try {
      await task(client)
      setSyncState('synced')
      setSyncMessage('서버와 동기화됐습니다.')
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? `${error.message} 로컬 변경은 보존했습니다.` : '서버 저장에 실패했지만 로컬 변경은 보존했습니다.')
    }
  }, [client])

  const addIdeas = useCallback(async (texts: string[]) => {
    const ideas = texts.map((text) => createIdea(text))
    dispatch({ type: 'ideas/add', ideas })
    await remoteTask(async (api) => {
      const created = await Promise.all(ideas.map((idea) => api.createIdea(idea.text)))
      created.forEach((remote, index) => dispatch({ type: 'idea/link-server', id: ideas[index].id, serverId: remote.id }))
    })
  }, [remoteTask])

  const updateIdea = useCallback(async (idea: Idea, text: string) => {
    dispatch({ type: 'idea/update', id: idea.id, text })
    await remoteTask(async (api) => {
      if (idea.serverId) await api.updateIdea(idea.serverId, text.trim())
      else {
        const remote = await api.createIdea(text.trim())
        dispatch({ type: 'idea/link-server', id: idea.id, serverId: remote.id })
      }
    })
  }, [remoteTask])

  const deleteIdea = useCallback(async (idea: Idea) => {
    dispatch({ type: 'idea/delete', id: idea.id })
    await remoteTask(async (api) => { if (idea.serverId) await api.deleteIdea(idea.serverId) })
  }, [remoteTask])

  const toggleFavorite = useCallback((id: string) => dispatch({ type: 'idea/favorite', id }), [])

  const moveIdea = useCallback(async (idea: Idea, groupId: string | null) => {
    dispatch({ type: 'idea/move', id: idea.id, groupId })
    const group = board.groups.find((item) => item.id === groupId)
    await remoteTask(async (api) => { if (idea.serverId) await api.moveIdea(idea.serverId, group?.serverId ?? null) })
  }, [board.groups, remoteTask])

  const addGroup = useCallback(async (name: string) => {
    const group = createGroup(name, board.groups.length)
    dispatch({ type: 'group/add', group })
    await remoteTask(async (api) => {
      const remote = await api.createGroup(group.name)
      dispatch({ type: 'group/link-server', id: group.id, serverId: remote.id })
    })
  }, [board.groups.length, remoteTask])

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    const group = board.groups.find((item) => item.id === groupId)
    dispatch({ type: 'group/rename', id: groupId, name })
    await remoteTask(async (api) => { if (group?.serverId) await api.renameGroup(group.serverId, name.trim()) })
  }, [board.groups, remoteTask])

  const reloadRemote = useCallback(async () => {
    if (!client) return
    setSyncState('syncing')
    setSyncMessage('서버 데이터를 불러오는 중…')
    try {
      dispatch({ type: 'hydrate', board: await client.loadBoard() })
      setSyncState('synced')
      setSyncMessage('서버의 최신 보드를 불러왔습니다.')
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? error.message : '서버 데이터를 불러오지 못했습니다.')
    }
  }, [client])

  return { board, syncState, syncMessage, remoteEnabled: Boolean(client), addIdeas, updateIdea, deleteIdea, toggleFavorite, moveIdea, addGroup, renameGroup, reloadRemote }
}
