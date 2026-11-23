import type { SyncState } from '../types'

interface AppHeaderProps {
  title: string
  ideaCount: number
  groupCount: number
  syncState: SyncState
  syncMessage: string
  remoteEnabled: boolean
  onReload: () => void
}

const labels: Record<SyncState, string> = { local: '로컬 저장', syncing: '동기화 중', synced: '동기화 완료', error: '동기화 오류' }

export function AppHeader({ title, ideaCount, groupCount, syncState, syncMessage, remoteEnabled, onReload }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">IH</div>
      <div className="title-block">
        <span className="eyebrow">IDEA HUB</span>
        <h1>{title}</h1>
        <p>{ideaCount}개 아이디어 · {groupCount}개 그룹</p>
      </div>
      <div className="header-actions">
        <div className={`sync-badge sync-${syncState}`} title={syncMessage} role="status">
          <span className="sync-dot" aria-hidden="true" />{labels[syncState]}
        </div>
        {remoteEnabled ? <button className="button secondary compact" type="button" onClick={onReload}>서버에서 새로고침</button> : null}
      </div>
    </header>
  )
}
