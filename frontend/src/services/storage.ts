import { createStarterBoard } from '../domain/board'
import type { Board } from '../types'

const STORAGE_KEY = 'idea-hub.board.v1'

export const loadBoard = (): Board => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createStarterBoard()
    const parsed = JSON.parse(raw) as Board
    if (!Array.isArray(parsed.ideas) || !Array.isArray(parsed.groups)) throw new Error('invalid board')
    return parsed
  } catch {
    return createStarterBoard()
  }
}

export const saveBoard = (board: Board): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
}
