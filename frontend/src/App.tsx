import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { BoardCanvas } from './components/BoardCanvas'
import { BoardTopBar, type BoardView } from './components/BoardTopBar'
import { BulkInputDialog } from './components/BulkInputDialog'
import { AlertIcon, CloseIcon, MissingIcon, OfflineIcon, SearchIcon } from './components/Icons'
import { Sidebar } from './components/Sidebar'
import { ToolPanel, type CanvasTool } from './components/ToolPanel'
import { DEFAULT_ZOOM_INDEX, ZOOM_STEPS, movePositionsToServerIds, positionKey, type Point } from './domain/layout'
import { useIdeaBoard, type BoardLoadState } from './hooks/useIdeaBoard'
import { loadPositions, savePositions } from './services/positions'
import type { Idea } from './types'

const hintFor = (view: BoardView, tool: CanvasTool) => {
  if (tool === 'hand') return '드래그해서 보드를 움직여요 · 다른 도구를 고르면 꺼져요'
  if (tool === 'memo') return view === 'cards' ? '메모를 놓을 곳을 한 번 누르세요' : '카드 보기에서 메모를 놓을 수 있어요'
  if (tool === 'mark') return '표시할 메모를 누르세요 · 다시 누르면 해제'
  return view === 'cards'
    ? '빈 곳을 두 번 누르면 거기서 바로 적기 · Enter 메모지로 붙이기 · Shift+Enter 다음 줄 · 메모지를 두 번 누르면 고치기'
    : '메모를 누르면 다른 주제로 옮길 수 있어요 · 주제 이름을 누르면 접고 펼쳐요'
}

export default function App() {
  const controller = useIdeaBoard()
  const { board, analyzing, remoteEnabled, syncState, syncMessage, addIdeas, analyzeBoard, openBoard, reloadRemote } = controller
  // Phone-width screens: the menu and tool panel would cover the canvas, so they start folded and zoomed out.
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760)
  const [loadState, setLoadState] = useState<BoardLoadState>(remoteEnabled ? 'loading' : 'ready')
  const [view, setView] = useState<BoardView>('cards')
  const [tool, setTool] = useState<CanvasTool>('select')
  const [zoomIndex, setZoomIndex] = useState(narrow ? 0 : DEFAULT_ZOOM_INDEX)
  const [sidebarOpen, setSidebarOpen] = useState(!narrow)
  const [toolsOpen, setToolsOpen] = useState(!narrow)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [analysisFailed, setAnalysisFailed] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const boardKey = board.serverId !== undefined ? `server-${board.serverId}` : board.id
  const [positions, setPositions] = useState<Record<string, Point>>(() => loadPositions(boardKey))


  // Open the server board as soon as the screen loads.
  useEffect(() => { if (remoteEnabled) void openBoard().then(setLoadState) }, [openBoard, remoteEnabled])
  const retryOpen = () => { setLoadState('loading'); void openBoard().then(setLoadState) }

  // A new memo gets its spot before the server assigns an id. As soon as the id is known,
  // re-key the spot so it survives analysis/reload (both replace local ids with server ids).
  const migratedPositions = movePositionsToServerIds(positions, board.ideas)
  if (migratedPositions !== positions) setPositions(migratedPositions)
  const storedPositions = migratedPositions
  useEffect(() => { savePositions(boardKey, storedPositions) }, [boardKey, storedPositions])

  const classified = board.groups.some((group) => !group.nameIsManual) || board.ideas.some((idea) => idea.groupId !== null)
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('ko-KR'))
  const hits = useMemo(() => {
    if (!searchOpen || !deferredQuery) return null
    return new Set(board.ideas.filter((idea) => idea.text.toLocaleLowerCase('ko-KR').includes(deferredQuery)).map((idea) => idea.id))
  }, [board.ideas, deferredQuery, searchOpen])

  const createAt = useCallback((text: string, at: Point) => {
    void addIdeas([text], (created) => {
      const idea = created[0]
      if (idea) setPositions((current) => ({ ...current, [idea.id]: at }))
    })
  }, [addIdeas])

  const deleteIdea = useCallback(async (idea: Idea) => {
    await controller.deleteIdea(idea)
    setPositions((current) => {
      if (!current[positionKey(idea)] && !current[idea.id]) return current
      const next = { ...current }
      delete next[positionKey(idea)]
      delete next[idea.id]
      return next
    })
  }, [controller])

  const analyze = useCallback(async () => {
    setAnalysisFailed(false)
    setTool('select')
    if (await analyzeBoard()) setView('groups')
    else setAnalysisFailed(true)
  }, [analyzeBoard])

  // Saving is not a blocker: analyzeBoard waits for memos that are still being created.
  const canAnalyze = remoteEnabled && loadState === 'ready' && !analyzing && board.ideas.length > 0
  const analyzeTitle = !remoteEnabled ? '서버 연결 후 사용할 수 있어요.'
    : board.ideas.length === 0 ? '메모를 먼저 적어 주세요.'
      : '저장된 메모를 비슷한 주제끼리 묶어요.'
  const toggleSearch = () => { setSearchOpen((value) => !value); setQuery('') }
  const showSaveError = syncState === 'error' && !analysisFailed && dismissedError !== syncMessage && loadState === 'ready'
  const noHit = hits !== null && hits.size === 0

  return (
    <div className="board-shell">
      {sidebarOpen ? (
        <Sidebar
          boardTitle={board.title}
          ideaCount={board.ideas.length}
          syncState={syncState}
          syncMessage={syncMessage}
          remoteEnabled={remoteEnabled}
          locked={analyzing}
          onHide={() => setSidebarOpen(false)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenBulk={() => setBulkOpen(true)}
          onReload={() => { void reloadRemote() }}
        />
      ) : null}
      <main className="board-area" aria-label={`${board.title} 보드`}>
        <h1 className="sr-only">{board.title}</h1>
        {loadState === 'ready' ? (
          <BoardCanvas
            view={view}
            ideas={board.ideas}
            groups={board.groups}
            classified={classified}
            savedPositions={storedPositions}
            zoom={ZOOM_STEPS[zoomIndex]}
            topOffset={narrow ? 124 : 72}
            tool={tool}
            hits={hits}
            locked={analyzing}
            startWithDraft={board.ideas.length === 0}
            onToolDone={() => setTool('select')}
            onCreate={createAt}
            onUpdate={controller.updateIdea}
            onDelete={deleteIdea}
            onFavorite={controller.toggleFavorite}
            onMove={controller.moveIdea}
            onRenameGroup={controller.renameGroup}
            onAddGroup={controller.addGroup}
          />
        ) : null}

        <BoardTopBar
          view={view}
          sidebarOpen={sidebarOpen}
          classified={classified}
          analyzing={analyzing}
          canAnalyze={canAnalyze}
          analyzeTitle={analyzeTitle}
          searchOpen={searchOpen}
          query={query}
          hitCount={hits ? hits.size : null}
          zoomLabel={`${Math.round(ZOOM_STEPS[zoomIndex] * 100)}%`}
          canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
          canZoomOut={zoomIndex > 0}
          onShowSidebar={() => setSidebarOpen(true)}
          onViewChange={setView}
          onAnalyze={() => { void analyze() }}
          onToggleSearch={toggleSearch}
          onQueryChange={setQuery}
          onZoomIn={() => setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1))}
          onZoomOut={() => setZoomIndex((index) => Math.max(index - 1, 0))}
          onZoomReset={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
        />
        {loadState === 'ready' ? <ToolPanel open={toolsOpen} tool={tool} onToggle={() => setToolsOpen((value) => !value)} onPick={setTool} /> : null}

        {analyzing ? <div className="busy-pill" role="status"><span className="spinner" aria-hidden="true" />비슷한 메모끼리 묶는 중이에요</div> : null}

        {analysisFailed && !analyzing ? (
          <div className="notice-banner danger" role="alert">
            <AlertIcon />
            <span><strong>분류하지 못했어요</strong><span>{syncMessage}</span></span>
            <button className="button primary compact" type="button" disabled={!canAnalyze} onClick={() => { void analyze() }}>다시 시도</button>
            <button className="icon-button plain" type="button" aria-label="알림 닫기" onClick={() => setAnalysisFailed(false)}><CloseIcon /></button>
          </div>
        ) : null}

        {noHit && !analyzing ? (
          <div className="no-hit" role="status">
            <span className="round-icon"><SearchIcon size={20} /></span>
            <strong>‘{query.trim()}’와 맞는 메모가 없어요</strong>
            <span>다른 낱말로 찾아보세요. 분류한 뒤에는 주제별 줄에서 살펴볼 수도 있어요.</span>
            <button className="button secondary compact" type="button" onClick={() => setQuery('')}>찾기 지우기</button>
          </div>
        ) : null}

        {loadState === 'loading' ? (
          <div className="board-loading" role="status" aria-busy="true">
            <span className="loading-label"><span className="spinner dark" aria-hidden="true" />보드를 불러오는 중이에요</span>
            <div className="skeleton-grid" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <span key={index} style={{ opacity: 1 - index * 0.07 }} />)}</div>
          </div>
        ) : null}

        {loadState === 'offline' || loadState === 'notfound' ? (
          <div className="board-error-card" role="alert">
            <span className={`round-icon large ${loadState === 'offline' ? 'danger' : ''}`}>{loadState === 'offline' ? <OfflineIcon /> : <MissingIcon />}</span>
            <h2>{loadState === 'offline' ? '보드를 불러오지 못했어요' : '이 보드를 찾을 수 없어요'}</h2>
            <p>{loadState === 'offline'
              ? '서버에 연결할 수 없어요. 인터넷 연결과 백엔드 실행 상태를 확인한 뒤 다시 시도해 주세요. 이미 저장된 메모는 사라지지 않아요.'
              : '보드가 지워졌거나 보드 번호(VITE_BOARD_ID)가 잘못됐어요.'}</p>
            {loadState === 'offline' ? <button className="button primary" type="button" onClick={retryOpen}>다시 시도</button> : null}
          </div>
        ) : null}

        {showSaveError ? (
          <div className="save-error" role="alert">
            <span>{syncMessage}</span>
            {remoteEnabled ? <button type="button" className="button light compact" onClick={() => { void reloadRemote() }}>서버에서 다시 불러오기</button> : null}
            <button className="icon-button plain inverse" type="button" aria-label="알림 닫기" onClick={() => setDismissedError(syncMessage)}><CloseIcon /></button>
          </div>
        ) : null}

        {loadState === 'ready' ? <div className="hint-bar">{hintFor(view, tool)}</div> : null}
      </main>
      <BulkInputDialog open={bulkOpen} existing={board.ideas} onClose={() => setBulkOpen(false)} onAdd={addIdeas} />
    </div>
  )
}
