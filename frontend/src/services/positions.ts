import type { Point } from '../domain/layout'

/**
 * Where each sticky note sits on the canvas. The current API has no x/y fields,
 * so positions are kept in this browser only (see README, 시안 중 미연결 기능).
 */
const PREFIX = 'idea-hub.positions.v1.'

const isPoint = (value: unknown): value is Point => Boolean(value)
  && typeof (value as Point).x === 'number' && Number.isFinite((value as Point).x)
  && typeof (value as Point).y === 'number' && Number.isFinite((value as Point).y)

export const loadPositions = (boardKey: string): Record<string, Point> => {
  try {
    const raw = localStorage.getItem(PREFIX + boardKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, Point] => isPoint(entry[1])))
  } catch {
    return {}
  }
}

export const savePositions = (boardKey: string, positions: Record<string, Point>): void => {
  try {
    localStorage.setItem(PREFIX + boardKey, JSON.stringify(positions))
  } catch {
    // Positions are a convenience; the memo itself is already saved.
  }
}
