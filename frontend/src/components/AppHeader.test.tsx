import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from './AppHeader'

describe('AppHeader', () => {
  it('keeps remote refresh available when synchronization is idle', () => {
    render(<AppHeader title="보드" ideaCount={2} groupCount={1} syncState="synced" syncMessage="완료" remoteEnabled onReload={vi.fn()} />)
    expect(screen.getByRole('button', { name: '서버에서 새로고침' })).toBeEnabled()
  })

  it('prevents a refresh race while synchronization is in progress', () => {
    render(<AppHeader title="보드" ideaCount={2} groupCount={1} syncState="syncing" syncMessage="저장 중" remoteEnabled onReload={vi.fn()} />)
    expect(screen.getByRole('button', { name: '서버에서 새로고침' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })
})
