'use client'

import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

type Props = {
  /** The entry URI — shown in the fallback for debugging. */
  uri: string
  children: ReactNode
}

type State = { hasError: boolean }

/**
 * Catches rendering errors in individual card components so a single
 * bad entry doesn't crash the entire give page. Renders a minimal
 * fallback row instead of the broken card.
 */
export class CardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`CardErrorBoundary: render failed for ${this.props.uri}`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <li className="flex items-center gap-3 px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-xs text-red-400 dark:bg-red-950 dark:text-red-500">
            !
          </span>
          <span className="min-w-0 truncate">
            Failed to render {this.props.uri}
          </span>
        </li>
      )
    }
    return this.props.children
  }
}
