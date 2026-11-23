import { useState } from 'react'
import { MAX_GROUP_NAME_LENGTH, validateGroupName } from '../domain/board'

interface AddGroupFormProps { onAdd: (name: string) => Promise<void> }

export function AddGroupForm({ onAdd }: AddGroupFormProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    const message = validateGroupName(name)
    if (message) { setError(message); return }
    setSaving(true); await onAdd(name); setSaving(false); setName(''); setError(''); setOpen(false)
  }

  if (!open) return <button className="add-group-card" type="button" onClick={() => setOpen(true)}><span aria-hidden="true">＋</span>새 그룹 만들기</button>
  return (
    <section className="add-group-form" aria-label="새 그룹 만들기">
      <label htmlFor="new-group">그룹 이름</label>
      <input id="new-group" maxLength={MAX_GROUP_NAME_LENGTH} value={name} onChange={(event) => { setName(event.target.value); setError('') }} autoFocus />
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="inline-actions"><button className="button ghost compact" type="button" onClick={() => { setOpen(false); setError('') }}>취소</button><button className="button primary compact" type="button" disabled={saving} onClick={() => void submit()}>만들기</button></div>
    </section>
  )
}
