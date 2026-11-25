import type { Board, FilterState, Idea, IdeaGroup } from '../types'

export const MAX_BULK_IDEAS = 50
export const MAX_IDEA_LENGTH = 500
export const MAX_GROUP_NAME_LENGTH = 40

const GROUP_COLORS = ['#2f6feb', '#8b3fd9', '#0e9468', '#e8620f', '#d6336c', '#7a5c00']

export const createId = (prefix: string): string => {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}

export const createIdea = (text: string, groupId: string | null = null): Idea => {
  const now = new Date().toISOString()
  return {
    id: createId('idea'),
    text: text.trim(),
    groupId,
    favorite: false,
    assignmentIsManual: groupId !== null,
    createdAt: now,
    updatedAt: now,
  }
}

export const createGroup = (name: string, index = 0): IdeaGroup => ({
  id: createId('group'),
  name: name.trim(),
  nameIsManual: true,
  color: GROUP_COLORS[index % GROUP_COLORS.length],
})

export const createStarterBoard = (): Board => {
  const ui = createGroup('화면 UI', 0)
  const search = createGroup('검색과 탐색', 1)
  const collaboration = createGroup('협업', 2)
  const ideas = [
    createIdea('메인 화면은 심플하게', ui.id),
    createIdea('검색 결과를 바로 강조하기', search.id),
    createIdea('여러 명이 동시에 아이디어 입력', collaboration.id),
    createIdea('발표 전에 사용자 흐름 점검하기'),
  ]
  return {
    id: 'local-board',
    title: '새로운 아이디어 보드',
    groups: [ui, search, collaboration],
    ideas,
    updatedAt: new Date().toISOString(),
  }
}

export interface BulkParseResult {
  ideas: string[]
  duplicates: number
  error?: string
}

export const parseBulkIdeas = (input: string, existing: Idea[] = []): BulkParseResult => {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return { ideas: [], duplicates: 0, error: '한 줄에 하나씩 아이디어를 입력해 주세요.' }
  if (lines.length > MAX_BULK_IDEAS) {
    return { ideas: [], duplicates: 0, error: `한 번에 최대 ${MAX_BULK_IDEAS}개까지 입력할 수 있어요.` }
  }
  if (lines.some((line) => line.length > MAX_IDEA_LENGTH)) {
    return { ideas: [], duplicates: 0, error: `아이디어는 ${MAX_IDEA_LENGTH}자 이하여야 해요.` }
  }

  const known = new Set(existing.map((idea) => idea.text.trim().toLocaleLowerCase('ko-KR')))
  const unique: string[] = []
  let duplicates = 0
  for (const line of lines) {
    const key = line.toLocaleLowerCase('ko-KR')
    if (known.has(key)) {
      duplicates += 1
      continue
    }
    known.add(key)
    unique.push(line)
  }
  if (unique.length === 0) return { ideas: [], duplicates, error: '새로 추가할 아이디어가 없어요.' }
  return { ideas: unique, duplicates }
}

export const validateIdea = (text: string): string | null => {
  const value = text.trim()
  if (!value) return '아이디어 내용을 입력해 주세요.'
  if (value.length > MAX_IDEA_LENGTH) return `아이디어는 ${MAX_IDEA_LENGTH}자 이하여야 해요.`
  return null
}

export const validateGroupName = (name: string): string | null => {
  const value = name.trim()
  if (!value) return '그룹 이름을 입력해 주세요.'
  if (value.length > MAX_GROUP_NAME_LENGTH) return `그룹 이름은 ${MAX_GROUP_NAME_LENGTH}자 이하여야 해요.`
  return null
}

export const filterIdeas = (ideas: Idea[], filter: FilterState): Idea[] => {
  const query = filter.query.trim().toLocaleLowerCase('ko-KR')
  return ideas.filter((idea) => {
    if (filter.favoritesOnly && !idea.favorite) return false
    if (filter.groupId === 'unclassified' && idea.groupId !== null) return false
    if (filter.groupId !== 'all' && filter.groupId !== 'unclassified' && idea.groupId !== filter.groupId) return false
    return !query || idea.text.toLocaleLowerCase('ko-KR').includes(query)
  })
}

export const mergeRemoteBoard = (remote: Board, local: Board): Board => {
  const localIdeas = new Map(
    local.ideas
      .filter((idea): idea is Idea & { serverId: number } => idea.serverId !== undefined)
      .map((idea) => [idea.serverId, idea]),
  )
  const localGroups = new Map(
    local.groups
      .filter((group): group is IdeaGroup & { serverId: number } => group.serverId !== undefined)
      .map((group) => [group.serverId, group]),
  )
  return {
    ...remote,
    groups: [
      ...remote.groups.map((group) => {
        const localGroup = group.serverId === undefined ? undefined : localGroups.get(group.serverId)
        return localGroup?.nameIsManual ? { ...group, name: localGroup.name, color: localGroup.color, nameIsManual: true } : group
      }),
      ...local.groups.filter((group) => group.serverId === undefined),
    ],
    ideas: [
      ...remote.ideas.map((idea) => {
        const localIdea = idea.serverId === undefined ? undefined : localIdeas.get(idea.serverId)
        const localIsNewer = localIdea !== undefined && Date.parse(localIdea.updatedAt) > Date.parse(idea.updatedAt)
        return {
          ...idea,
          text: localIsNewer ? localIdea.text : idea.text,
          favorite: localIdea?.favorite ?? idea.favorite,
          groupId: localIdea?.assignmentIsManual ? localIdea.groupId : idea.groupId,
          assignmentIsManual: localIdea?.assignmentIsManual ?? idea.assignmentIsManual,
          updatedAt: localIsNewer ? localIdea.updatedAt : idea.updatedAt,
        }
      }),
      ...local.ideas.filter((idea) => idea.serverId === undefined),
    ],
  }
}

export type BoardAction =
  | { type: 'hydrate'; board: Board }
  | { type: 'ideas/add'; ideas: Idea[] }
  | { type: 'idea/update'; id: string; text: string }
  | { type: 'idea/delete'; id: string }
  | { type: 'idea/restore'; idea: Idea; index: number }
  | { type: 'idea/favorite'; id: string }
  | { type: 'idea/move'; id: string; groupId: string | null }
  | { type: 'idea/link-server'; id: string; serverId: number }
  | { type: 'group/add'; group: IdeaGroup }
  | { type: 'group/rename'; id: string; name: string }
  | { type: 'group/link-server'; id: string; serverId: number }

const touched = (board: Board): Board => ({ ...board, updatedAt: new Date().toISOString() })

export const boardReducer = (board: Board, action: BoardAction): Board => {
  switch (action.type) {
    case 'hydrate': return action.board
    case 'ideas/add': return touched({ ...board, ideas: [...action.ideas, ...board.ideas] })
    case 'idea/update':
      return touched({ ...board, ideas: board.ideas.map((idea) => idea.id === action.id ? { ...idea, text: action.text.trim(), updatedAt: new Date().toISOString() } : idea) })
    case 'idea/delete': return touched({ ...board, ideas: board.ideas.filter((idea) => idea.id !== action.id) })
    case 'idea/restore': {
      if (board.ideas.some((idea) => idea.id === action.idea.id)) return board
      const ideas = [...board.ideas]
      ideas.splice(Math.min(Math.max(action.index, 0), ideas.length), 0, action.idea)
      return touched({ ...board, ideas })
    }
    case 'idea/favorite':
      return touched({ ...board, ideas: board.ideas.map((idea) => idea.id === action.id ? { ...idea, favorite: !idea.favorite } : idea) })
    case 'idea/move':
      return touched({ ...board, ideas: board.ideas.map((idea) => idea.id === action.id ? { ...idea, groupId: action.groupId, assignmentIsManual: true, updatedAt: new Date().toISOString() } : idea) })
    case 'idea/link-server':
      return { ...board, ideas: board.ideas.map((idea) => idea.id === action.id ? { ...idea, serverId: action.serverId } : idea) }
    case 'group/add': return touched({ ...board, groups: [...board.groups, action.group] })
    case 'group/rename':
      return touched({ ...board, groups: board.groups.map((group) => group.id === action.id ? { ...group, name: action.name.trim(), nameIsManual: true } : group) })
    case 'group/link-server':
      return { ...board, groups: board.groups.map((group) => group.id === action.id ? { ...group, serverId: action.serverId } : group) }
    default: return board
  }
}
