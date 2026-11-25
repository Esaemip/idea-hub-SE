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

  it('recovers from JSON with an invalid board shape', () => {
    localStorage.setItem('idea-hub.board.v1', JSON.stringify({ id: 'bad', title: 'bad', ideas: [{ id: 'missing-fields', text: 'bad' }], groups: [] }))
    expect(loadBoard().id).toBe('local-board')
  })

  it('rejects incomplete nested card data instead of crashing later', () => {
    const board = createStarterBoard()
    const incomplete = { ...board, ideas: board.ideas.map((idea) => ({ ...idea, updatedAt: undefined })) }
    localStorage.setItem('idea-hub.board.v1', JSON.stringify(incomplete))
    expect(loadBoard().id).toBe('local-board')
  })
})
