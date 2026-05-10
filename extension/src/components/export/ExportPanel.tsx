'use client'

import { useState } from 'react'
import { AnalyzeResponse } from '@/types'
import { Download, FileText, Code, CheckCircle } from 'lucide-react'
import { exportReport } from '@/lib/api'
import toast from 'react-hot-toast'

interface ExportPanelProps {
  result: AnalyzeResponse
}

export default function ExportPanel({ result }: ExportPanelProps) {
  const [exporting, setExporting] = useState<string | null>(null)

  const doExport = async (format: 'json' | 'text') => {
    setExporting(format)
    try {
      const blob = await exportReport(result, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = format === 'json' ? 'legalcopilot-report.json' : 'legalcopilot-report.txt'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded successfully')
    } catch {
      toast.error('Export failed. Is the backend running?')
    } finally {
      setExporting(null)
    }
  }

  const exportClientSideJSON = () => {
    const json = JSON.stringify(result, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'legalcopilot-report.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('JSON report downloaded')
  }

  const critical = result.risk_distribution.critical
  const high = result.risk_distribution.high
  const medium = result.risk_distribution.medium
  const low = result.risk_distribution.low

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Summary card */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.02em' }}>
          Analysis Summary
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {[
            { label: 'Overall Risk Score', value: `${result.overall_risk_score}/100` },
            { label: 'Risk Level', value: result.summary.risk_level },
            { label: 'Total Clauses', value: result.summary.total_clauses },
            { label: 'Red Flags Found', value: result.summary.red_flag_count },
            { label: 'Critical Clauses', value: critical },
            { label: 'High Risk Clauses', value: high },
            { label: 'Medium Risk Clauses', value: medium },
            { label: 'Low Risk Clauses', value: low },
          ].map(({ label, value }) => (
            <div key={label} style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export options */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.02em' }}>
          Download Report
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
          Export the full analysis for your records.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* JSON export */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                backgroundColor: 'var(--brand-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Code size={18} color="var(--brand-primary)" />
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>JSON Report</p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Full structured data with all clauses and scores</p>
              </div>
            </div>
            <button
              onClick={exportClientSideJSON}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--brand-primary)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-geist)',
              }}
            >
              <Download size={14} />
              Download
            </button>
          </div>

          {/* Text export */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                backgroundColor: '#f0fdf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileText size={18} color="#16a34a" />
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Text Report</p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Human-readable report via backend API</p>
              </div>
            </div>
            <button
              onClick={() => doExport('text')}
              disabled={exporting === 'text'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: exporting === 'text' ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-geist)',
              }}
            >
              <Download size={14} />
              {exporting === 'text' ? 'Exporting...' : 'Download'}
            </button>
          </div>
        </div>
      </div>

      {/* Key risks preview */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', letterSpacing: '-0.02em' }}>
          Report Preview — Key Risks
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {result.summary.key_risks.slice(0, 5).map((risk, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '10px 12px',
              backgroundColor: 'var(--risk-high-bg)',
              borderRadius: '8px',
              borderLeft: '3px solid var(--risk-high)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--risk-high)', paddingTop: '1px', flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {risk}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* API reference */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <CheckCircle size={15} color="var(--brand-primary)" />
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            API Access
          </h4>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
          The LegalCopilot backend exposes a REST API. Use the endpoint below to integrate analysis into your own systems.
        </p>
        <div style={{
          padding: '10px 14px',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--brand-primary)',
          border: '1px solid var(--border-default)',
        }}>
          POST http://localhost:8000/api/analyze
        </div>
        <a
          href="http://localhost:8000/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--brand-primary)',
            textDecoration: 'none',
          }}
        >
          View full API documentation
        </a>
      </div>
    </div>
  )
}
