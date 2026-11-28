import type { SyncState } from '../types'
import { FolderIcon, LogoMark, PanelIcon, PlusIcon, SearchIcon, StackIcon } from './Icons'

interface SidebarProps {
  boardTitle: string
  ideaCount: number
  syncState: SyncState
  syncMessage: string
  remoteEnabled: boolean
  locked: boolean
  onHide: () => void
  onOpenSearch: () => void
  onOpenBulk: () => void
  onReload: () => void
}

const syncLabels: Record<SyncState, string> = { local: '이 브라우저에 저장', syncing: '저장하는 중', synced: '서버에 저장됨', error: '저장 문제 있음' }
const NOT_IN_SCOPE = '보드 목록 화면은 별도 작업으로 연결할 예정이에요.'

export function Sidebar({ boardTitle, ideaCount, syncState, syncMessage, remoteEnabled, locked, onHide, onOpenSearch, onOpenBulk, onReload }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="메뉴">
      <div className="sidebar-brand">
        <button className="icon-button plain" type="button" aria-label="메뉴 숨기기" onClick={onHide}><PanelIcon /></button>
        <LogoMark />
        <span>Idea hub</span>
      </div>
      <nav className="sidebar-nav" aria-label="보드 메뉴">
        <button type="button" className="sidebar-link strong" aria-disabled="true" title={NOT_IN_SCOPE}><PlusIcon />새로운 메모 보드 만들기</button>
        <button type="button" className="sidebar-link" onClick={onOpenSearch}><SearchIcon />검색</button>
        <button type="button" className="sidebar-link" aria-disabled="true" title={NOT_IN_SCOPE}><FolderIcon />프로젝트</button>
        <button type="button" className="sidebar-link" disabled={locked} onClick={onOpenBulk}><StackIcon />여러 개 입력</button>
      </nav>
      <div className="sidebar-recent">
        <span className="sidebar-caption">최근 항목</span>
        <span className="sidebar-current" aria-current="page" title={boardTitle}>{boardTitle}<small>{ideaCount}</small></span>
      </div>
      <span className="sidebar-spacer" />
      <div className="sidebar-sync">
        <span className={`sync-chip sync-${syncState}`} role="status" aria-busy={syncState === 'syncing'} title={syncMessage}><span className="sync-dot" aria-hidden="true" />{syncLabels[syncState]}</span>
        {remoteEnabled ? <button className="button secondary compact" type="button" disabled={syncState === 'syncing' || locked} onClick={onReload}>서버에서 새로고침</button> : null}
      </div>
    </aside>
  )
}
