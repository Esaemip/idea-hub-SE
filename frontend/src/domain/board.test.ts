import { describe, expect, it } from 'vitest'
import { boardReducer, createGroup, createIdea, createStarterBoard, filterIdeas, mergeRemoteBoard, parseBulkIdeas } from './board'

describe('parseBulkIdeas', () => {
  it('removes blank lines and duplicates', () => {
    const result = parseBulkIdeas('첫 번째\n\n첫 번째\n기존 아이디어\n두 번째', [createIdea('기존 아이디어')])
    expect(result.ideas).toEqual(['첫 번째', '두 번째'])
    expect(result.duplicates).toBe(2)
  })
  it('rejects more than 50 non-empty lines', () => {
    expect(parseBulkIdeas(Array.from({ length: 51 }, (_, index) => `아이디어 ${index}`).join('\n')).error).toContain('최대 50개')
  })
})

describe('boardReducer', () => {
  it('supports the card lifecycle without mutating the previous board', () => {
    const board = createStarterBoard(); const idea = createIdea('새 카드')
    const added = boardReducer(board, { type: 'ideas/add', ideas: [idea] })
    const updated = boardReducer(added, { type: 'idea/update', id: idea.id, text: '수정한 카드' })
    const removed = boardReducer(updated, { type: 'idea/delete', id: idea.id })
    expect(board.ideas).not.toContainEqual(idea)
    expect(updated.ideas.find((item) => item.id === idea.id)?.text).toBe('수정한 카드')
    expect(removed.ideas.find((item) => item.id === idea.id)).toBeUndefined()
  })
  it('creates, renames and manually assigns a group', () => {
    const board = createStarterBoard(); const group = createGroup('새 그룹'); const idea = board.ideas[0]
    let state = boardReducer(board, { type: 'group/add', group })
    state = boardReducer(state, { type: 'group/rename', id: group.id, name: '바뀐 그룹' })
    state = boardReducer(state, { type: 'idea/move', id: idea.id, groupId: group.id })
    expect(state.groups.at(-1)?.name).toBe('바뀐 그룹')
    expect(state.ideas.find((item) => item.id === idea.id)).toMatchObject({ groupId: group.id, assignmentIsManual: true })
  })
})

describe('filterIdeas', () => {
  it('combines search, group and favorite filters', () => {
    const board = createStarterBoard(); const groupId = board.groups[0].id
    const ideas = board.ideas.map((idea, index) => index === 0 ? { ...idea, favorite: true } : idea)
    expect(filterIdeas(ideas, { query: '메인', groupId, favoritesOnly: true })).toHaveLength(1)
    expect(filterIdeas(ideas, { query: '없음', groupId: 'all', favoritesOnly: false })).toHaveLength(0)
  })
})

describe('mergeRemoteBoard', () => {
  it('preserves unsynced local work and favorites when refreshing from the server', () => {
    const local = createStarterBoard()
    local.ideas[0] = { ...local.ideas[0], serverId: 11, favorite: true }
    const localOnlyIdea = createIdea('아직 서버에 없는 카드')
    local.ideas.push(localOnlyIdea)

    const remote = createStarterBoard()
    remote.ideas = [{ ...remote.ideas[0], id: 'server-idea-11', serverId: 11, favorite: false }]
    remote.groups = remote.groups.map((group, index) => ({ ...group, serverId: index + 1 }))

    const merged = mergeRemoteBoard(remote, local)

    expect(merged.ideas.find((idea) => idea.serverId === 11)?.favorite).toBe(true)
    expect(merged.ideas).toContainEqual(localOnlyIdea)
    expect(merged.groups).toEqual(expect.arrayContaining(local.groups.filter((group) => group.serverId === undefined)))
  })
})
