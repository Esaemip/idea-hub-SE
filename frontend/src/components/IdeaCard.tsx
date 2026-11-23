import { memo, useState } from 'react'
import { MAX_IDEA_LENGTH, validateIdea } from '../domain/board'
import type { Idea, IdeaGroup } from '../types'

interface IdeaCardProps {
  idea: Idea
  groups: IdeaGroup[]
  onUpdate: (idea: Idea, text: string) => Promise<void>
  onDelete: (idea: Idea) => Promise<void>
  onFavorite: (id: string) => void
  onMove: (idea: Idea, groupId: string | null) => Promise<void>
}

export const IdeaCard = memo(function IdeaCard({ idea, groups, onUpdate, onDelete, onFavorite, onMove }: IdeaCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(idea.text)
  const [error, setError] = useState('')
  const save = async () => {
    const message = validateIdea(draft)
    if (message) { setError(message); return }
    await onUpdate(idea, draft); setEditing(false); setError('')
  }
  const remove = async () => { if (window.confirm('이 아이디어를 삭제할까요?')) await onDelete(idea) }

  return (
    <article className="idea-card" draggable={!editing} onDragStart={(event) => { event.dataTransfer.setData('text/plain', idea.id); event.dataTransfer.effectAllowed = 'move' }}>
      <div className="card-topline"><span className="drag-handle" title="다른 그룹으로 끌어서 이동" aria-hidden="true">⠿</span><button className={`icon-button star ${idea.favorite ? 'active' : ''}`} type="button" aria-label={idea.favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'} aria-pressed={idea.favorite} onClick={() => onFavorite(idea.id)}>★</button></div>
      {editing ? (
        <div className="edit-panel">
          <label className="sr-only" htmlFor={`edit-${idea.id}`}>아이디어 수정</label>
          <textarea id={`edit-${idea.id}`} value={draft} maxLength={MAX_IDEA_LENGTH} onChange={(event) => setDraft(event.target.value)} autoFocus rows={4} />
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <div className="inline-actions"><button className="button ghost compact" type="button" onClick={() => { setEditing(false); setDraft(idea.text); setError('') }}>취소</button><button className="button primary compact" type="button" onClick={() => void save()}>저장</button></div>
        </div>
      ) : <button className="card-text" type="button" onClick={() => setEditing(true)} aria-label={`${idea.text} 수정`}>{idea.text}</button>}
      <div className="card-footer">
        <label className="group-select-label"><span className="sr-only">카드 그룹 이동</span><select value={idea.groupId ?? ''} onChange={(event) => void onMove(idea, event.target.value || null)} aria-label="카드 그룹 이동"><option value="">미분류</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        {idea.assignmentIsManual ? <span className="manual-badge" title="사용자가 직접 배치함">고정</span> : null}
        <button className="icon-button delete" type="button" aria-label="아이디어 삭제" onClick={() => void remove()}>×</button>
      </div>
    </article>
  )
})
