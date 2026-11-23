import { useState, type CSSProperties, type DragEvent } from 'react'
import { validateGroupName } from '../domain/board'
import type { Idea, IdeaGroup } from '../types'
import { IdeaCard } from './IdeaCard'

interface GroupColumnProps {
  group: IdeaGroup | null
  ideas: Idea[]
  groups: IdeaGroup[]
  onUpdate: (idea: Idea, text: string) => Promise<void>
  onDelete: (idea: Idea) => Promise<void>
  onFavorite: (id: string) => void
  onMove: (idea: Idea, groupId: string | null) => Promise<void>
  onDropIdea: (ideaId: string, groupId: string | null) => Promise<void>
  onRename: (groupId: string, name: string) => Promise<void>
}

export function GroupColumn({ group, ideas, groups, onUpdate, onDelete, onFavorite, onMove, onDropIdea, onRename }: GroupColumnProps) {
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group?.name ?? '')
  const [error, setError] = useState('')
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault(); setDragOver(false)
    const ideaId = event.dataTransfer.getData('text/plain')
    if (ideaId) void onDropIdea(ideaId, group?.id ?? null)
  }
  const saveName = async () => {
    if (!group) return
    const message = validateGroupName(name)
    if (message) { setError(message); return }
    await onRename(group.id, name); setRenaming(false); setError('')
  }

  return (
    <section className={`group-column ${dragOver ? 'drag-over' : ''}`} aria-labelledby={`group-${group?.id ?? 'unclassified'}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false) }} onDrop={drop} style={{ '--group-color': group?.color ?? '#8a8d97' } as CSSProperties}>
      <header className="group-header">
        <span className="group-color" aria-hidden="true" />
        {renaming && group ? (
          <div className="rename-form"><label className="sr-only" htmlFor={`group-name-${group.id}`}>그룹 이름</label><input id={`group-name-${group.id}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus /><button className="icon-button" type="button" aria-label="그룹 이름 저장" onClick={() => void saveName()}>✓</button></div>
        ) : <div><h2 id={`group-${group?.id ?? 'unclassified'}`}>{group?.name ?? '미분류'}</h2><p>{ideas.length}개 아이디어</p></div>}
        {group && !renaming ? <button className="icon-button" type="button" aria-label={`${group.name} 이름 수정`} onClick={() => setRenaming(true)}>✎</button> : null}
      </header>
      {error ? <p className="field-error group-error" role="alert">{error}</p> : null}
      <div className="card-list">{ideas.length ? ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} groups={groups} onUpdate={onUpdate} onDelete={onDelete} onFavorite={onFavorite} onMove={onMove} />) : <p className="empty-group">카드를 이곳으로 끌어오세요.</p>}</div>
    </section>
  )
}
