import { useState, useEffect } from 'react'
import { Shield, ExternalLink, RefreshCw, AlertTriangle, CheckCircle, Clock, FileText, Loader2 } from 'lucide-react'
import { AnalyzeResponse, RISK_COLORS } from '@/types'

export default function SidePanel() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [meta, setMeta] = useState<{ url?: string; title?: string; time?: number }>({})
  const [loading, setLoading] = useState(true)

  const loadLastAnalysis = async () => {
    setLoading(true)
    try {
      const data = await chrome.storage.local.get([
        'lastAnalysis', 'lastAnalysisUrl', 'lastAnalysisTitle', 'lastAnalysisTime',
      ])
      if (data.lastAnalysis) {
        setResult(data.lastAnalysis)
        setMeta({
          url: data.lastAnalysisUrl,
          title: data.lastAnalysisTitle,
          time: data.lastAnalysisTime,
        })
      }
    } catch (err) {
      console.error('Failed to load analysis:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLastAnalysis()

    // Listen for updates from popup
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.lastAnalysis) {
        loadLastAnalysis()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const openNewTab = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/newtab/index.html') })
  }

  const timeAgo = meta.time
    ? (() => {
        const diff = Date.now() - meta.time
        if (diff < 60000) return 'Just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return new Date(meta.time).toLocaleDateString()
      })()
    : null

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '12px', backgroundColor: 'var(--bg-base)',
      }}>
        <Loader2 size={24} color="var(--brand-primary)" className="animate-spin" />
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading analysis...</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '24px',
      }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '14px',
          backgroundColor: 'var(--brand-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={28} color="var(--brand-primary)" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No Analysis Yet</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            Click the extension icon and scan a page, or open the full dashboard to upload a document.
          </p>
        </div>
        <button
          onClick={openNewTab}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            backgroundColor: 'var(--brand-primary)', color: 'white',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-geist)', display: 'flex',
            alignItems: 'center', gap: '6px',
          }}
        >
          <ExternalLink size={14} />
          Open Full Dashboard
        </button>
      </div>
    )
  }

  const score = result.overall_risk_score
  const scoreColor = score >= 70 ? RISK_COLORS.Critical
    : score >= 50 ? RISK_COLORS.High
    : score >= 30 ? RISK_COLORS.Medium
    : RISK_COLORS.Low

  const riskLabel = score >= 70 ? 'Critical Risk'
    : score >= 50 ? 'High Risk'
    : score >= 30 ? 'Moderate Risk'
    : 'Low Risk'

  const circumference = 2 * Math.PI * 54
  const offset = circumference - (score / 100) * circumference

  return (
    <div style={{ backgroundColor: 'var(--bg-base)', minHeight: '100vh', fontFamily: 'var(--font-geist)' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        background: 'linear-gradient(135deg, #1a1f36, #2a3ee8)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={16} />
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.02em' }}>LegalCopilot</span>
        </div>
        <button
          onClick={loadLastAnalysis}
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '6px', padding: '4px 8px',
            color: 'white', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: '4px', fontSize: '11px',
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {/* Source info */}
        {meta.title && (
          <div style={{
            padding: '10px 12px', backgroundColor: 'var(--bg-subtle)',
            borderRadius: '8px', marginBottom: '14px',
          }}>
            <p style={{
              fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0,
            }}>
              {meta.title}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <Clock size={10} color="var(--text-tertiary)" />
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{timeAgo}</span>
            </div>
          </div>
        )}

        {/* Score gauge */}
        <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
          <p style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px',
          }}>
            Overall Risk Score
          </p>

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="54" fill="none" stroke="var(--bg-muted)" strokeWidth="10" />
              <circle
                cx="70" cy="70" r="54"
                fill="none"
                stroke={scoreColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '36px', fontWeight: 800, color: scoreColor, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {score}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>/ 100</span>
            </div>
          </div>

          <div style={{
            marginTop: '12px', padding: '6px 16px',
            backgroundColor: scoreColor + '18',
            borderRadius: '8px', display: 'inline-block',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: scoreColor }}>
              {riskLabel}
            </span>
          </div>
        </div>

        {/* Distribution */}
        <div className="card" style={{ padding: '16px', marginTop: '12px' }}>
          <p style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px',
          }}>
            Risk Distribution
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Critical', count: result.risk_distribution.critical, color: RISK_COLORS.Critical },
              { label: 'High', count: result.risk_distribution.high, color: RISK_COLORS.High },
              { label: 'Medium', count: result.risk_distribution.medium, color: RISK_COLORS.Medium },
              { label: 'Low', count: result.risk_distribution.low, color: RISK_COLORS.Low },
            ].map(({ label, count, color }) => (
              <div key={label} style={{
                padding: '8px 10px', backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px', borderLeft: `3px solid ${color}`,
              }}>
                <p style={{ fontSize: '18px', fontWeight: 700, color, letterSpacing: '-0.03em', margin: 0 }}>{count}</p>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 500, margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="card" style={{ padding: '16px', marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Clauses', value: result.summary.total_clauses, icon: FileText },
              { label: 'Red Flags', value: result.summary.red_flag_count, icon: AlertTriangle },
              { label: 'Time', value: `${result.processing_time.toFixed(1)}s`, icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ textAlign: 'center', padding: '8px' }}>
                <Icon size={14} color="var(--text-tertiary)" style={{ margin: '0 auto 4px' }} />
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{value}</p>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Verdict */}
        <div style={{
          marginTop: '12px', padding: '12px 14px',
          backgroundColor: scoreColor + '10',
          border: `1px solid ${scoreColor}30`,
          borderRadius: '8px',
          borderLeft: `3px solid ${scoreColor}`,
        }}>
          <p style={{
            fontSize: '11px', fontWeight: 700, color: scoreColor,
            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px',
          }}>
            AI Verdict
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {result.summary.verdict}
          </p>
        </div>

        {/* Key risks */}
        {result.summary.key_risks.length > 0 && (
          <div className="card" style={{ padding: '14px', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <AlertTriangle size={13} color="var(--risk-high)" />
              <p style={{
                fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0,
              }}>
                Key Risks
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {result.summary.key_risks.slice(0, 4).map((risk, i) => (
                <div key={i} style={{
                  fontSize: '12px', color: 'var(--text-secondary)', padding: '7px 10px',
                  backgroundColor: 'var(--risk-high-bg)', borderRadius: '6px',
                  borderLeft: '3px solid var(--risk-high)', lineHeight: 1.4,
                }}>
                  {risk}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open full dashboard button */}
        <button
          onClick={openNewTab}
          style={{
            width: '100%', marginTop: '14px', padding: '12px',
            borderRadius: '8px', border: 'none',
            background: 'linear-gradient(135deg, #2a3ee8, #607bff)',
            color: 'white', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'var(--font-geist)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            boxShadow: '0 4px 14px rgba(42, 62, 232, 0.35)',
          }}
        >
          <ExternalLink size={14} />
          View Full Details in New Tab
        </button>
      </div>
    </div>
  )
}
