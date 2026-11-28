import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarterBoard } from './domain/board'
import { saveBoard } from './services/storage'

const emptyBoard = () => {
  const board = createStarterBoard()
  board.ideas = []
  board.groups = []
  saveBoard(board)
}

const note = (text: string) => screen.getByRole('button', { name: text })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** Render the board in browser-only mode, independent of a developer's .env.local. */
const renderApp = async () => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubEnv('VITE_BOARD_ID', '')
  vi.resetModules()
  const { default: App } = await import('./App')
  return render(<App />)
}

describe('writing on the canvas', () => {
  it('opens an empty board with a focused draft and pastes notes with Enter', async () => {
    const user = userEvent.setup()
    emptyBoard()
    await renderApp()

    expect(screen.getByLabelText('빈 아이디어 보드')).toBeInTheDocument()
    const draft = screen.getByLabelText('새 메모')
    expect(draft).toHaveFocus()

    await user.keyboard('첫 번째 메모{Enter}')
    expect(note('첫 번째 메모')).toBeInTheDocument()
    expect(screen.queryByLabelText('빈 아이디어 보드')).not.toBeInTheDocument()

    // The next draft is ready right away, so writing continues without clicking.
    const next = screen.getByLabelText('새 메모')
    expect(next).toHaveFocus()
    expect(next).toHaveValue('')
    await user.keyboard('두 번째{Shift>}{Enter}{/Shift}줄바꿈')
    expect(next).toHaveValue('두 번째\n줄바꿈')
    await user.keyboard('{Enter}')
    expect(note('두 번째\n줄바꿈')).toBeInTheDocument()
  })

  it('does not paste while a Korean syllable is still being composed', async () => {
    emptyBoard()
    await renderApp()
    const draft = screen.getByLabelText('새 메모')
    fireEvent.change(draft, { target: { value: '검' } })

    fireEvent.keyDown(draft, { key: 'Enter', keyCode: 229 })
    fireEvent.keyDown(draft, { key: 'Enter', isComposing: true })
    expect(screen.queryByRole('button', { name: '검' })).not.toBeInTheDocument()

    fireEvent.keyDown(draft, { key: 'Enter' })
    expect(note('검')).toBeInTheDocument()
  })

  it('starts a draft where the empty canvas is double-clicked', async () => {
    const user = userEvent.setup()
    emptyBoard()
    await renderApp()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('새 메모')).not.toBeInTheDocument()

    fireEvent.doubleClick(screen.getByRole('region', { name: '메모 캔버스' }), { clientX: 420, clientY: 350 })
    const draft = screen.getByLabelText('새 메모')
    expect(draft).toHaveFocus()
    expect(draft.parentElement).toHaveStyle({ left: '592px', top: '480px' })
    await user.keyboard('여기에 적기{Enter}')
    expect(note('여기에 적기').parentElement).toHaveStyle({ left: '592px', top: '480px' })
  })

  it('edits, marks and deletes a note from the selection toolbar', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderApp()

    await user.click(note('메인 화면은 심플하게'))
    const tools = screen.getByRole('toolbar', { name: '선택한 메모 도구' })
    await user.click(within(tools).getByRole('button', { name: '편집' }))
    const editor = screen.getByLabelText('메모 고치기')
    await user.clear(editor)
    await user.type(editor, '메인 화면은 더 심플하게{Enter}')
    expect(note('메인 화면은 더 심플하게')).toBeInTheDocument()

    await user.click(note('메인 화면은 더 심플하게'))
    await user.click(within(screen.getByRole('toolbar', { name: '선택한 메모 도구' })).getByRole('button', { name: '표시' }))
    expect(screen.getByTitle('표시한 메모')).toBeInTheDocument()

    // The note stays selected after marking, so the same toolbar can delete it.
    await user.click(within(screen.getByRole('toolbar', { name: '선택한 메모 도구' })).getByRole('button', { name: '삭제' }))
    expect(screen.queryByText('메인 화면은 더 심플하게')).not.toBeInTheDocument()
  })

  it('edits a note in place with a double-click and cancels with Escape', async () => {
    const user = userEvent.setup()
    await renderApp()
    await user.dblClick(note('발표 전에 사용자 흐름 점검하기'))
    await user.type(screen.getByLabelText('메모 고치기'), ' 바뀐 글{Escape}')
    expect(note('발표 전에 사용자 흐름 점검하기')).toBeInTheDocument()
  })

  it('adds multiple validated ideas at once', async () => {
    const user = userEvent.setup(); await renderApp()
    await user.click(screen.getByRole('button', { name: '여러 개 입력' }))
    await user.type(screen.getByLabelText('아이디어 목록'), '일괄 아이디어 A{enter}일괄 아이디어 B{enter}일괄 아이디어 A')
    await user.click(screen.getByRole('button', { name: '2개 추가' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(note('일괄 아이디어 A')).toBeInTheDocument()
    expect(note('일괄 아이디어 B')).toBeInTheDocument()
  })

  it('closes the bulk dialog with Escape and returns focus to its opener', async () => {
    const user = userEvent.setup(); await renderApp()
    const opener = screen.getByRole('button', { name: '여러 개 입력' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('highlights search hits and explains when nothing matches', async () => {
    const user = userEvent.setup(); await renderApp()
    await user.click(screen.getByRole('button', { name: '메모 찾기' }))
    await user.type(screen.getByLabelText('메모 찾기'), '검색')
    expect(await screen.findByText('메모 1개 찾음')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('메모 찾기'))
    await user.type(screen.getByLabelText('메모 찾기'), '없는 낱말')
    expect(await screen.findByText('‘없는 낱말’와 맞는 메모가 없어요')).toBeInTheDocument()
  })

  it('needs a server before classifying', async () => {
    await renderApp()
    const classify = screen.getByRole('button', { name: '다시 분류' })
    expect(classify).toBeDisabled()
    expect(classify).toHaveAttribute('title', '서버 연결 후 사용할 수 있어요.')
  })
})

describe('topic rows', () => {
  it('renames a topic, moves a note and collapses a row', async () => {
    const user = userEvent.setup(); await renderApp()
    await user.click(screen.getByRole('tab', { name: '분류' }))
    expect(screen.getByRole('region', { name: '주제별 분류' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '미분류' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '화면 UI 이름 고치기' }))
    const input = screen.getByLabelText('주제 이름')
    await user.clear(input); await user.type(input, '화면 디자인{Enter}')
    expect(screen.getByRole('heading', { name: '화면 디자인' })).toBeInTheDocument()

    await user.click(note('발표 전에 사용자 흐름 점검하기'))
    await user.click(within(screen.getByRole('toolbar', { name: '선택한 메모 도구' })).getByRole('button', { name: '화면 디자인' }))
    expect(screen.queryByRole('heading', { name: '미분류' })).not.toBeInTheDocument()
    expect(within(note('발표 전에 사용자 흐름 점검하기')).getByText('고정')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '화면 디자인 접기' }))
    expect(note('메인 화면은 심플하게')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '화면 디자인 펼치기' }))
    expect(note('메인 화면은 심플하게')).toBeEnabled()
  })

  it('creates a topic', async () => {
    const user = userEvent.setup(); await renderApp()
    await user.click(screen.getByRole('tab', { name: '분류' }))
    await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }))
    await user.type(screen.getByLabelText('그룹 이름'), '신규 주제{Enter}')
    expect(screen.getByRole('heading', { name: '신규 주제' })).toBeInTheDocument()
  })
})

describe('with the backend', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const remoteBoard = {
    id: 1, title: '서버 보드', updated_at: '2026-11-25T00:00:00.000Z', groups: [],
    ideas: [{ id: 7, text: '서버 메모', group_id: null, assignment_is_manual: false, created_at: '2026-11-25T00:00:00.000Z', updated_at: '2026-11-25T00:00:00.000Z' }],
  }

  const renderRemote = async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_BOARD_ID', '1')
    vi.resetModules()
    const { default: RemoteApp } = await import('./App')
    return render(<RemoteApp />)
  }

  it('loads the server board when the screen opens', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(remoteBoard))
    await renderRemote()
    expect(screen.getByText('보드를 불러오는 중이에요')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '서버 메모' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '서버 보드' })).toBeInTheDocument()
  })

  it('shows a retry card when the server cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'))
    await renderRemote()
    expect(await screen.findByText('보드를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('shows that analysis is running, then the topic rows', async () => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') return new Promise<Response>((resolve) => { finish = resolve })
      return json(remoteBoard)
    })
    const user = userEvent.setup()
    await renderRemote()
    await user.click(await screen.findByRole('button', { name: '분류하기' }))

    expect(screen.getByText('비슷한 메모끼리 묶는 중이에요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '분류하는 중' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '여러 개 입력' })).toBeDisabled()
    await user.dblClick(screen.getByRole('button', { name: '서버 메모' }))
    expect(screen.queryByLabelText('메모 고치기')).not.toBeInTheDocument()

    await act(async () => finish(json({ ...remoteBoard, groups: [{ id: 3, name: 'AI 주제', name_is_manual: false }], ideas: [{ ...remoteBoard.ideas[0], group_id: 3 }] })))
    expect(await screen.findByRole('heading', { name: 'AI 주제' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '분류' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps the board and offers a retry when analysis fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => init?.method === 'POST'
      ? json({ detail: '분석에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 503)
      : json(remoteBoard))
    const user = userEvent.setup()
    await renderRemote()
    await user.click(await screen.findByRole('button', { name: '분류하기' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('분류하지 못했어요')
    expect(alert).toHaveTextContent('기존 화면은 그대로 유지했습니다.')
    expect(within(alert).getByRole('button', { name: '다시 시도' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '서버 메모' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '카드' })).toHaveAttribute('aria-selected', 'true')
  })
})
