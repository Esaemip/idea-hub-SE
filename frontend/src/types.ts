export type GroupId = string | null

export interface Idea {
  id: string
  serverId?: number
  text: string
  groupId: GroupId
  favorite: boolean
  assignmentIsManual: boolean
  createdAt: string
  updatedAt: string
}

export interface IdeaGroup {
  id: string
  serverId?: number
  name: string
  nameIsManual: boolean
  color: string
}

export interface Board {
  id: string
  serverId?: number
  title: string
  groups: IdeaGroup[]
  ideas: Idea[]
  updatedAt: string
}

export type SyncState = 'local' | 'syncing' | 'synced' | 'error'

export interface FilterState {
  query: string
  groupId: 'all' | 'unclassified' | string
  favoritesOnly: boolean
}
