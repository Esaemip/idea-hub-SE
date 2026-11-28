import { useEffect, useRef } from 'react'
import { PanelIcon, SearchIcon, SparkIcon } from './Icons'

export type BoardView = 'cards' | 'groups'

interface BoardTopBarProps {
  view: BoardView
  sidebarOpen: boolean
  classified: boolean
  analyzing: boolean
  canAnalyze: boolean
  analyzeTitle: string
  searchOpen: boolean
  query: string
  hitCount: number | null
  zoomLabel: string
  canZoomIn: boolean
  canZoomOut: boolean
  onShowSidebar: () => void
  onViewChange: (view: BoardView) => void
  onAnalyze: () => void
  onToggleSearch: () => void
  onQueryChange: (query: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

export function BoardTopBar(props: BoardTopBarProps) {
  const { view, sidebarOpen, classified, analyzing, canAnalyze, analyzeTitle, searchOpen, query, hitCount, zoomLabel, canZoomIn, canZoomOut } = props
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen])

  return (
    <div className="top-bar">
      {!sidebarOpen ? <button className="floating-button square" type="button" aria-label="메뉴 보기" onClick={props.onShowSidebar}><PanelIcon /></button> : null}
      <div className="view-tabs" role="tablist" aria-label="보기">
        {(['cards', 'groups'] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => props.onViewChange(key)}>{key === 'cards' ? '카드' : '분류'}</button>
        ))}
      </div>
      <button className="classify-button" type="button" disabled={!canAnalyze} title={analyzeTitle} aria-label={analyzing ? '분류하는 중' : classified ? '다시 분류' : '분류하기'} onClick={props.onAnalyze}>
        <SparkIcon />{analyzing ? '분류하는 중…' : classified ? '다시 분류' : '분류하기'}
      </button>
      {hitCount !== null && hitCount > 0 ? <span className="hit-pill" role="status">메모 {hitCount}개 찾음</span> : null}
      <span className="top-bar-spacer" />
      <div className="view-controls">
        {searchOpen ? (
          <>
            <label className="sr-only" htmlFor="memo-q">메모 찾기</label>
            <input ref={searchRef} id="memo-q" value={query} placeholder="메모 찾기" autoComplete="off" onChange={(event) => props.onQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') props.onToggleSearch() }} />
          </>
        ) : null}
        <button className="icon-button plain" type="button" aria-label={searchOpen ? '찾기 닫기' : '메모 찾기'} aria-pressed={searchOpen} onClick={props.onToggleSearch}><SearchIcon /></button>
        <span className="divider" aria-hidden="true" />
        <button className="icon-button plain zoom" type="button" aria-label="축소" disabled={!canZoomOut} onClick={props.onZoomOut}>−</button>
        <button className="zoom-label" type="button" aria-label={`70%로 맞추기 (지금 ${zoomLabel})`} onClick={props.onZoomReset}>{zoomLabel}</button>
        <button className="icon-button plain zoom" type="button" aria-label="확대" disabled={!canZoomIn} onClick={props.onZoomIn}>+</button>
      </div>
      <button className="floating-button" type="button" aria-disabled="true" title="공유 API가 아직 없어 연결하지 않았어요.">공유</button>
    </div>
  )
}
