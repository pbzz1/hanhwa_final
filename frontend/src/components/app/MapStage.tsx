import type { ReactNode } from 'react'

type MapStageProps = {
  children: ReactNode
}

export function MapStage({ children }: MapStageProps) {
  return <div className="service-map-main-col">{children}</div>
}
