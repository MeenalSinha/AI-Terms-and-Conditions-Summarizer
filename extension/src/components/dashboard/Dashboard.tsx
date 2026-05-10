'use client'

import { useState } from 'react'
import { AnalyzeResponse } from '@/types'
import RiskOverview from './RiskOverview'
import ClauseList from '../clauses/ClauseList'
import SummaryPanel from './SummaryPanel'
import ChatAssistant from '../chat/ChatAssistant'
import ExportPanel from '../export/ExportPanel'
import RedFlagBanner from './RedFlagBanner'
import { BarChart2, FileText, MessageSquare, Download, RotateCcw, List } from 'lucide-react'

type Tab = 'overview' | 'clauses' | 'summary' | 'chat' | 'export'

interface DashboardProps {
  result: AnalyzeResponse
  documentText: string
  onReset: () => void
}

export default function Dashboard({ result, documentText, onReset }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'overview', label: 'Risk Overview', icon: BarChart2 },
    { id: 'clauses', label: 'Clauses', icon: List, badge: result.clauses.length },
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
    { id: 'export', label: 'Export', icon: Download },
  ]

  const criticalCount = result.risk_distribution.critical
  const highCount = result.risk_distribution.high

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Red flag banner */}
      {(criticalCount > 0 || highCount > 2) && (
        <RedFlagBanner
          criticalCount={criticalCount}
          highCount={highCount}
          verdict={result.summary.verdict}
        />
      )}

      {/* Top stats bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {[
          { label: 'Risk Score', value: `${result.overall_risk_score}/100`, color: result.overall_risk_score >= 70 ? 'var(--risk-critical)' : result.overall_risk_score >= 50 ? 'var(--risk-high)' : result.overall_risk_score >= 30 ? 'var(--risk-medium)' : 'var(--risk-low)' },
          { label: 'Clauses Analyzed', value: result.summary.total_clauses.toString(), color: 'var(--brand-primary)' },
          { label: 'Red Flags', value: result.summary.red_flag_count.toString(), color: result.summary.red_flag_count > 5 ? 'var(--risk-high)' : 'var(--text-secondary)' },
          { label: 'Processing Time', value: `${result.processing_time.toFixed(1)}s`, color: 'var(--text-secondary)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {label}
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color, letterSpacing: '-0.03em' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Navigation tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: '10px',
        padding: '4px',
        marginBottom: '20px',
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 12px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: isActive ? 'var(--bg-surface)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400,
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'var(--font-geist)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={14} />
              {tab.label}
              {tab.badge !== undefined && (
                <span style={{
                  backgroundColor: isActive ? 'var(--brand-light)' : 'var(--bg-muted)',
                  color: isActive ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '9999px',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}

        <button
          onClick={onReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 14px',
            borderRadius: '7px',
            border: '1px solid var(--border-default)',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-geist)',
            marginLeft: 'auto',
          }}
        >
          <RotateCcw size={13} />
          New Analysis
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <RiskOverview result={result} />}
      {activeTab === 'clauses' && <ClauseList clauses={result.clauses} />}
      {activeTab === 'summary' && <SummaryPanel summary={result.summary} />}
      {activeTab === 'chat' && (
        <ChatAssistant
          documentContext={result.summary.key_risks.join('. ') + ' ' + result.summary.verdict}
          documentId={result.document_id}
        />
      )}
      {activeTab === 'export' && <ExportPanel result={result} />}
    </div>
  )
}
