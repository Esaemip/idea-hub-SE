import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Idea, IdeaGroup } from '../types'
import { BoardModeBar } from './BoardModeBar'
import { GroupColumn } from './GroupColumn'
import { IdeaComposer } from './IdeaComposer'

const group: IdeaGroup = { id: 'server-group-4', serverId: 4, name: '저장 그룹', nameIsManual: false, color: '#2f6feb' }
const idea: Idea = {
  id: 'server-idea-7', serverId: 7, text: '저장 카드', groupId: group.id, favorite: false,
  assignmentIsManual: true, createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z',
}

describe('analysis interaction lock', () => {
  it('prevents new input while analysis is running', () => {
    render(<>
      <BoardModeBar mode="cards" hasAnalysis={false} analyzing syncing={false} remoteEnabled onModeChange={vi.fn()} onAnalyze={vi.fn()} onOpenBulk={vi.fn()} />
      <IdeaComposer onAdd={vi.fn()} analyzing />
    </>)

    expect(screen.getByLabelText('새 아이디어')).toBeDisabled()
    expect(screen.getByRole('button', { name: '아이디어 분석 중' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '여러 개 입력' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '메모지 붙이기' })).toBeDisabled()
  })

  it('prevents card and group mutations while analysis is running', () => {
    render(<GroupColumn
      group={group}
      ideas={[idea]}
      groups={[group]}
      locked
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onFavorite={vi.fn()}
      onMove={vi.fn()}
      onDropIdea={vi.fn()}
      onRename={vi.fn()}
    />)

    expect(screen.getByLabelText('저장 그룹 이름 수정')).toBeDisabled()
    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('draggable', 'false')
    expect(within(card).getByRole('button', { name: '저장 카드 수정' })).toBeDisabled()
    expect(within(card).getByLabelText('즐겨찾기에 추가')).toBeDisabled()
    expect(within(card).getByLabelText('카드 그룹 이동')).toBeDisabled()
    expect(within(card).getByLabelText('아이디어 삭제')).toBeDisabled()
  })
})
