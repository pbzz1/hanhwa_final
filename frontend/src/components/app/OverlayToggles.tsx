import type { ReactNode } from 'react'

type OverlayTogglesProps = {
  children: ReactNode
}

export function OverlayToggles({ children }: OverlayTogglesProps) {
  return <section className="service-panel-section">{children}</section>
}
