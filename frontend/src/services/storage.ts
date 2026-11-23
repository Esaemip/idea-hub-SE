import { createStarterBoard } from '../domain/board'
import type { Board } from '../types'

const STORAGE_KEY = 'idea-hub.board.v1'

const isBoard = (value: unknown): value is Board => {
  if (!value || typeof value !== 'object') return false
  const board = value as Partial<Board>
  if (typeof board.id !== 'string' || typeof board.title !== 'string' || !Array.isArray(board.ideas) || !Array.isArray(board.groups)) return false
  return board.ideas.every((idea) => idea
    && typeof idea.id === 'string'
    && typeof idea.text === 'string'
    && (idea.groupId === null || typeof idea.groupId === 'string')
    && typeof idea.favorite === 'boolean')
    && board.groups.every((group) => group
      && typeof group.id === 'string'
      && typeof group.name === 'string'
      && typeof group.color === 'string')
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
