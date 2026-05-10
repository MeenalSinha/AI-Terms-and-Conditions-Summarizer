export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface AnalyzedClause {
  id: string
  text: string
  category: string
  risk_level: RiskLevel
  risk_score: number
  user_impact: string
  explanation: string
  confidence: number
  red_flags: string[]
}

export interface RiskDistribution {
  low: number
  medium: number
  high: number
  critical: number
}

export interface DocumentSummary {
  overall_risk_score: number
  risk_level: RiskLevel
  key_risks: string[]
  user_rights: string[]
  most_dangerous_clauses: string[]
  total_clauses: number
  document_length: number
  red_flag_count: number
  verdict: string
  safe_aspects: string[]
}

export interface AnalyzeResponse {
  document_id: string
  overall_risk_score: number
  risk_distribution: RiskDistribution
  clauses: AnalyzedClause[]
  summary: DocumentSummary
  processing_time: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  confidence?: number
}

export interface ComparisonResult {
  document_a_score: number
  document_b_score: number
  safer_document: string
  comparison_points: Array<{
    category: string
    doc_a_score: number
    doc_b_score: number
    winner: string
    difference: number
  }>
  winner_explanation: string
  category_comparison: Record<string, {
    doc_a_score: number | null
    doc_b_score: number | null
    safer: string
  }>
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#16a34a',
  Medium: '#b45309',
  High: '#dc2626',
  Critical: '#7c2d12',
}

export const RISK_BG_COLORS: Record<RiskLevel, string> = {
  Low: '#f0fdf4',
  Medium: '#fffbeb',
  High: '#fef2f2',
  Critical: '#fff7ed',
}

export const RISK_BORDER_COLORS: Record<RiskLevel, string> = {
  Low: '#bbf7d0',
  Medium: '#fde68a',
  High: '#fecaca',
  Critical: '#fed7aa',
}
