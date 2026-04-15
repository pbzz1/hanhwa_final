import type { ReactNode } from 'react'

type ScenarioSidebarProps = {
  hidden?: boolean
  children: ReactNode
}

export function ScenarioSidebar({ hidden, children }: ScenarioSidebarProps) {
  return <aside className={`service-asset-panel${hidden ? ' service-asset-panel--hidden' : ''}`}>{children}</aside>
}
