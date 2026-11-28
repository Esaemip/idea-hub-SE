import { createStarterBoard } from '../domain/board'
import type { Board } from '../types'

const STORAGE_KEY = 'idea-hub.board.v1'

const isBoard = (value: unknown): value is Board => {
  if (!value || typeof value !== 'object') return false
  const board = value as Partial<Board>
  if (typeof board.id !== 'string'
    || typeof board.title !== 'string'
    || typeof board.updatedAt !== 'string'
    || (board.serverId !== undefined && typeof board.serverId !== 'number')
    || !Array.isArray(board.ideas)
    || !Array.isArray(board.groups)) return false
  return board.ideas.every((idea) => idea
    && typeof idea.id === 'string'
    && typeof idea.text === 'string'
    && (idea.groupId === null || typeof idea.groupId === 'string')
    && typeof idea.favorite === 'boolean'
    && typeof idea.assignmentIsManual === 'boolean'
    && typeof idea.createdAt === 'string'
    && typeof idea.updatedAt === 'string'
    && (idea.serverId === undefined || typeof idea.serverId === 'number'))
    && board.groups.every((group) => group
      && typeof group.id === 'string'
      && typeof group.name === 'string'
      && typeof group.nameIsManual === 'boolean'
      && typeof group.color === 'string'
      && (group.serverId === undefined || typeof group.serverId === 'number'))
}

export const loadBoard = (): Board => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createStarterBoard()
    const parsed: unknown = JSON.parse(raw)
    if (!isBoard(parsed)) throw new Error('invalid board')
    return parsed
  } catch {
    return createStarterBoard()
  }
}

export const saveBoard = (board: Board): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
}

/** Cached copy of a server board, or an empty board when the cache belongs to another board. */
export const loadServerBoardCache = (serverId: number): Board => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (isBoard(parsed) && parsed.serverId === serverId) return parsed
  } catch {
    // Fall through to an empty board; the server copy is loaded right after.
  }
  return { id: `server-board-${serverId}`, serverId, title: '아이디어 보드', groups: [], ideas: [], updatedAt: new Date(0).toISOString() }
}
