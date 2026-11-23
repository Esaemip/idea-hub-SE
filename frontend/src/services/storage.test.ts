import { describe, expect, it } from 'vitest'
import { createStarterBoard } from '../domain/board'
import { loadBoard, saveBoard } from './storage'

describe('local board storage', () => {
  it('restores the exact board after a page reload', () => {
    const board = createStarterBoard()
    board.ideas[0] = { ...board.ideas[0], text: '새로고침 뒤에도 남는 카드', favorite: true }
    saveBoard(board)
    expect(loadBoard()).toEqual(board)
  })

  it('recovers from malformed saved data', () => {
    localStorage.setItem('idea-hub.board.v1', '{broken')
    expect(loadBoard().ideas.length).toBeGreaterThan(0)
  })
})
