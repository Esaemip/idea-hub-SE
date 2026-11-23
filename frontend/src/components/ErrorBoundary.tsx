import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Idea Hub rendering error', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <span aria-hidden="true">!</span>
        <h1>화면을 표시하지 못했어요</h1>
        <p>브라우저에 저장한 데이터는 그대로 유지됩니다. 페이지를 다시 불러와 주세요.</p>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
      </main>
    )
  }
}
