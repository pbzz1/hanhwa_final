import type { ReactNode } from 'react'

type AppShellProps = {
  splitClassName?: string
  children: ReactNode
}

export function AppShell({ splitClassName, children }: AppShellProps) {
  return <div className={splitClassName ?? 'service-map-layout'}>{children}</div>
}
