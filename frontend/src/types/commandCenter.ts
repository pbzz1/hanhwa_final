export type FriendlyReadiness = '양호' | '경계' | '최고'

export type FriendlyUnitTableRow = {
  id: number
  unitCode: string
  name: string
  level: string
  branch: string
  formation: string
  lat: number
  lng: number
  locationText: string
  mission: string
  readiness: FriendlyReadiness
  equipment: string
  personnel: number | null
  updatedAt: string
  note: string
  /** 전술도 부호 한글 라벨(예: 보병(X), 기갑(타원)) */
  symbolLabel: string
  /** 상황 영상·이미지 URL — 카드 뷰 썸네일용 */
  situationMediaUrl: string | null
}

export type DispatchMessageType = 'INFO' | 'ALERT' | 'ORDER' | 'RECON'
export type DispatchPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type DispatchAttachmentFlags = {
  enemyPosition: boolean
  riskZones: boolean
  detections: boolean
  predictedRoute: boolean
  sensorAnalysis: boolean
}

export type DispatchMessage = {
  id: string
  receiverUnitId: number
  receiverUnitCode: string
  receiverUnitName: string
  title: string
  messageType: DispatchMessageType
  content: string
  priority: DispatchPriority
  attachments: DispatchAttachmentFlags
  relatedEnemyId?: number | null
  relatedRiskZoneId?: string | null
  relatedInferenceResultId?: string | null
  createdAt: string
  readAt?: string | null
}

export type DispatchFormState = {
  receiverUnitId: number | null
  messageType: DispatchMessageType
  priority: DispatchPriority
  title: string
  content: string
  attachments: DispatchAttachmentFlags
}
