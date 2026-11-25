import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { createStarterBoard } from './domain/board'
import { saveBoard } from './services/storage'

describe('Idea Hub card flows', () => {
  it('creates, searches and favorites a card', async () => {
    const user = userEvent.setup(); render(<App />)
    const input = screen.getByLabelText('새 아이디어')
    await user.type(input, '새로운 회의 아이디어'); fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('새로운 회의 아이디어')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('아이디어 찾기'), '새로운 회의')
    expect(screen.getByText('1개 표시')).toBeInTheDocument()
    await user.click(screen.getByLabelText('즐겨찾기에 추가'))
    await user.click(screen.getByRole('button', { name: '즐겨찾기' }))
    expect(screen.getByText('1개 표시')).toBeInTheDocument()
  })
  it('adds multiple validated ideas at once', async () => {
    const user = userEvent.setup(); render(<App />)
    await user.click(screen.getByRole('button', { name: '여러 개 입력' }))
    await user.type(screen.getByLabelText('아이디어 목록'), '일괄 아이디어 A{enter}일괄 아이디어 B{enter}일괄 아이디어 A')
    await user.click(screen.getByRole('button', { name: '2개 추가' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('일괄 아이디어 A')).toBeInTheDocument()
    expect(screen.getByText('일괄 아이디어 B')).toBeInTheDocument()
  })

  it('closes the bulk dialog with Escape and returns focus to its opener', async () => {
    const user = userEvent.setup(); render(<App />)
    const opener = screen.getByRole('button', { name: '여러 개 입력' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('shows the empty card board and allows switching to group management', async () => {
    const user = userEvent.setup()
    const board = createStarterBoard()
    board.ideas = []
    saveBoard(board)
    render(<App />)
    expect(screen.getByLabelText('빈 아이디어 보드')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '분류' }))
    expect(screen.getByLabelText('아이디어 그룹 보드')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 그룹 만들기' })).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 아이디어가 없어요')).not.toBeInTheDocument()
  })

  it('edits, moves and deletes a card', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    await user.type(screen.getByLabelText('새 아이디어'), '이동할 아이디어')
    fireEvent.keyDown(screen.getByLabelText('새 아이디어'), { key: 'Enter' })
    const cardButton = await screen.findByRole('button', { name: '이동할 아이디어 수정' })
    await user.click(cardButton)
    const editor = screen.getByLabelText('아이디어 수정')
    await user.clear(editor)
    await user.type(editor, '수정하고 이동할 아이디어')
    await user.click(screen.getByRole('button', { name: '저장' }))

    const card = screen.getByRole('button', { name: '수정하고 이동할 아이디어 수정' }).closest('article')
    expect(card).not.toBeNull()
    const groupSelect = within(card!).getByLabelText('카드 그룹 이동')
    await user.selectOptions(groupSelect, within(groupSelect).getByRole('option', { name: '화면 UI' }))
    const movedCard = screen.getByRole('button', { name: '수정하고 이동할 아이디어 수정' }).closest('article')
    expect(within(movedCard!).getByText('고정')).toBeInTheDocument()
    await user.click(within(movedCard!).getByLabelText('아이디어 삭제'))
    expect(screen.queryByText('수정하고 이동할 아이디어')).not.toBeInTheDocument()
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('creates and renames a group', async () => {
    const user = userEvent.setup(); render(<App />)
    await user.click(screen.getByRole('button', { name: '분류' }))
    await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }))
    await user.type(screen.getByLabelText('그룹 이름'), '신규 그룹')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '신규 그룹' })).toBeInTheDocument()
    await user.click(screen.getByLabelText('신규 그룹 이름 수정'))
    const input = screen.getByLabelText('그룹 이름')
    await user.clear(input); await user.type(input, '변경한 그룹')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '변경한 그룹' })).toBeInTheDocument()
  })
})
