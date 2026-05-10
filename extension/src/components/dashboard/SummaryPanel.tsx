'use client'

import { DocumentSummary, RISK_COLORS } from '@/types'
import { Shield, AlertTriangle, CheckCircle, FileText, Flag } from 'lucide-react'

interface SummaryPanelProps {
  summary: DocumentSummary
}

export default function SummaryPanel({ summary }: SummaryPanelProps) {
  const scoreColor = RISK_COLORS[summary.risk_level]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Verdict card */}
      <div className="card" style={{
        padding: '24px',
        borderLeft: `4px solid ${scoreColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: scoreColor + '18',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={20} color={scoreColor} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>AI Verdict</h3>
              <span style={{
                padding: '2px 10px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: scoreColor + '18',
                color: scoreColor,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {summary.risk_level}
              </span>
            </div>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {summary.verdict}
            </p>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        {/* Key Risks */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <AlertTriangle size={15} color="var(--risk-high)" />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Key Risks
            </h4>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {summary.key_risks.slice(0, 5).map((risk, i) => (
              <li key={i} style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                padding: '8px 10px',
                backgroundColor: 'var(--risk-high-bg)',
                borderRadius: '6px',
                borderLeft: '3px solid var(--risk-high)',
                lineHeight: 1.4,
              }}>
                {risk}
              </li>
            ))}
          </ul>
        </div>

        {/* User Rights */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <CheckCircle size={15} color="var(--risk-low)" />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Your Rights
            </h4>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(summary.user_rights.length > 0 ? summary.user_rights : summary.safe_aspects).slice(0, 5).map((right, i) => (
              <li key={i} style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                padding: '8px 10px',
                backgroundColor: 'var(--risk-low-bg)',
                borderRadius: '6px',
                borderLeft: '3px solid var(--risk-low)',
                lineHeight: 1.4,
              }}>
                {right}
              </li>
            ))}
            {summary.user_rights.length === 0 && summary.safe_aspects.length === 0 && (
              <li style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                No explicit rights detailed in this document.
              </li>
            )}
          </ul>
        </div>

        {/* Most Dangerous */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Flag size={15} color="var(--risk-critical)" />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Most Dangerous
            </h4>
          </div>
          {summary.most_dangerous_clauses.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {summary.most_dangerous_clauses.map((clause, i) => (
                <li key={i} style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  padding: '8px 10px',
                  backgroundColor: '#fff7ed',
                  borderRadius: '6px',
                  borderLeft: '3px solid var(--risk-critical)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.4,
                }}>
                  "{clause}"
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No critical clauses detected.
            </p>
          )}
        </div>
      </div>

      {/* Document stats */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <FileText size={15} color="var(--text-secondary)" />
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Document Statistics
          </h4>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Total Clauses', value: summary.total_clauses },
            { label: 'Document Length', value: `${(summary.document_length / 1000).toFixed(1)}k chars` },
            { label: 'Red Flags', value: summary.red_flag_count },
            { label: 'Risk Level', value: summary.risk_level },
          ].map(({ label, value }) => (
            <div key={label} style={{
              padding: '12px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '8px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                {value}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', fontWeight: 500 }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
