export type RiskLabel = 'low' | 'medium' | 'high'

export type RiskAlgorithm = 'hdbscan' | 'dbscan'

export type RiskPipelineMode = 'full' | 'ops' | 'ops_t20' | 'ops_t15'

export type RiskScoreMode = 'rule' | 'ml' | 'hybrid' | 'final'

export type RiskTopTag = 'top5' | 'top10' | 'top20' | null

export type RiskTopKMode = 'top5' | 'top10' | 'top20' | 'all'

export type RiskLidarMode = 'assisted' | 'radar-only'

export type RiskLidarFilterMode = 'assisted' | 'radar_only' | 'both'

export type RiskFeatureSet = 'A_strict_anti_leakage' | 'B_moderate_anti_leakage'

export type RiskSourceModel = 'hgb' | 'rf' | 'svm_rbf' | 'logreg'

export type RiskSplitMode = 'group_frame' | 'time' | 'contiguous_block'

export type RiskSuppressionStage = 'raw' | 'S1_geometric' | 'S2_temporal' | 'S3_utility'

export type RiskComparisonMode =
  | 'none'
  | 'rule_only'
  | 'no_lidar'
  | 'no_tracking_features'
  | 'no_calibration'

export type RiskExperimentVariant =
  | 'full_model'
  | 'rule_only'
  | 'no_lidar'
  | 'no_tracking_features'
  | 'no_calibration'
  | 'ml_only'
  | 'rule_plus_ml_hybrid'

export type RiskCandidateE2E = {
  id: string
  frameId: string
  frameOrder: number
  clusterId: number
  clusterUid: string
  trackId: string
  lat: number
  lng: number
  radiusM: number
  algorithm: RiskAlgorithm
  pipelineMode: RiskPipelineMode
  riskLabelRule: RiskLabel
  riskLabelHybrid: RiskLabel
  riskLabelFinal: RiskLabel
  riskScoreRule: number
  riskScoreMl: number
  riskScoreHybrid: number
  finalRiskScore: number
  rankingScore: number
  rankGlobal: number
  topTag: RiskTopTag
  trackAge: number
  trackLen: number
  avgSpeed: number
  approachScore: number
  temporalStability: number
  motionSmoothnessScore: number
  closingConsistencyScore: number
  trajectoryRiskProxy: number
  lidarMode: RiskLidarMode
  lidarCorroborationScore: number
  lidarLocalDensityR1: number
  lidarLocalDensityR2: number
  lidarLocalDensityR3: number
  lidarMinDist: number
  featureSet: RiskFeatureSet
  sourceModel: RiskSourceModel
  splitMode: RiskSplitMode
  suppressionStage: RiskSuppressionStage
  experimentVariant: RiskExperimentVariant
}

export type RiskPipelineSummary = {
  pipelineMode: RiskPipelineMode
  macroF1: number
  highRecall: number
  rankingAp: number
  burdenPerFrame: number
  calibrationUsed: boolean
  runtimeSecTotal: number
  note?: string
}

export type RiskSuppressionSummary = {
  rawHdbscanCandidates: number
  fullAfterSuppression: number
  opsAfterSuppression: number
  opsT20AfterSuppression: number
  opsT15AfterSuppression: number
}

export type RiskRuleThresholdSummary = {
  pipelineMode: 'full' | 'ops'
  low: number
  medium: number
  high: number
}

export type RiskUiState = {
  showRiskZones: boolean
  showRiskTracks: boolean
  showTopRiskOnly: boolean
  showRiskDetailPanel: boolean
  showRiskLegend: boolean
  showAllCandidates: boolean
  pipelineMode: RiskPipelineMode
  riskScoreMode: RiskScoreMode
  lidarMode: RiskLidarFilterMode
  clusterAlgoMode: RiskAlgorithm
  topKMode: RiskTopKMode
  comparisonMode: RiskComparisonMode
  showSuppressionStage: boolean
}
