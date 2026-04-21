import { forwardRef, type ReactNode } from 'react'

type ScenarioSidebarProps = {
  hidden?: boolean
  children: ReactNode
}

export const ScenarioSidebar = forwardRef<HTMLElement, ScenarioSidebarProps>(
  function ScenarioSidebar({ hidden, children }, ref) {
    return (
      <aside
        ref={ref}
        className={`service-asset-panel${hidden ? ' service-asset-panel--hidden' : ''}`}
      >
        {children}
      </aside>
    )
  },
)
