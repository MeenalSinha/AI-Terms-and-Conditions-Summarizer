import { useState } from 'react'
import { Shield, Scan, FileText, ExternalLink, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { analyzeText } from '@/lib/api'
import { AnalyzeResponse, RISK_COLORS } from '@/types'

export default function Popup() {
  const [isScanning, setIsScanning] = useState(false)
  const [quickResult, setQuickResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scanCurrentPage = async () => {
    setIsScanning(true)
    setError(null)
    setQuickResult(null)

    try {
      // Send message to content script to extract page text
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab found')

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_TEXT' })

      if (!response?.text || response.text.length < 100) {
        setError('Not enough text found on this page. Try a page with Terms & Conditions.')
        setIsScanning(false)
        return
      }

      // Analyze the extracted text
      const result = await analyzeText(response.text, tab.title || 'Current Page')
      setQuickResult(result)

      // Save to chrome.storage for side panel access
      await chrome.storage.local.set({
        lastAnalysis: result,
        lastAnalysisUrl: tab.url,
        lastAnalysisTitle: tab.title,
        lastAnalysisTime: Date.now(),
      })
    } catch (err: any) {
      console.error('Scan failed:', err)
      if (err?.message?.includes('Could not establish connection')) {
        setError('Cannot scan this page. Try refreshing the page first.')
      } else if (err?.message?.includes('backend') || err?.code === 'ERR_NETWORK') {
        setError('Backend is not running. Start it at localhost:8000.')
      } else {
        setError(err?.message || 'Scan failed. Please try again.')
      }
    } finally {
      setIsScanning(false)
    }
  }

  const openNewTab = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/newtab/index.html') })
  }

  const openSidePanel = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id })
      }
    } catch (err) {
      console.error('Failed to open side panel:', err)
    }
  }

  const scoreColor = quickResult
    ? quickResult.overall_risk_score >= 70 ? RISK_COLORS.Critical
      : quickResult.overall_risk_score >= 50 ? RISK_COLORS.High
      : quickResult.overall_risk_score >= 30 ? RISK_COLORS.Medium
      : RISK_COLORS.Low
    : undefined

  return (
    <div style={{
      width: '380px',
      minHeight: '420px',
      backgroundColor: 'var(--bg-base)',
      fontFamily: 'var(--font-geist)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #1a1f36, #2a3ee8)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Shield size={18} />
        </div>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.2 }}>
            LegalCopilot
          </h1>
          <p style={{ fontSize: '11px', opacity: 0.8, margin: 0 }}>AI-Powered T&C Analyzer</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px' }}>
        {/* Scan button */}
        <button
          onClick={scanCurrentPage}
          disabled={isScanning}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            background: isScanning
              ? 'var(--bg-muted)'
              : 'linear-gradient(135deg, #2a3ee8, #607bff)',
            color: isScanning ? 'var(--text-tertiary)' : 'white',
            fontSize: '14px',
            fontWeight: 700,
            cursor: isScanning ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-geist)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s',
            boxShadow: isScanning ? 'none' : '0 4px 14px rgba(42, 62, 232, 0.35)',
          }}
        >
          {isScanning ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Scanning page...
            </>
          ) : (
            <>
              <Scan size={16} />
              Scan This Page
            </>
          )}
        </button>

        {/* Error message */}
        {error && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            backgroundColor: 'var(--risk-high-bg)',
            border: '1px solid var(--risk-high-border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}>
            <AlertTriangle size={14} color="var(--risk-high)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <p style={{ fontSize: '12px', color: 'var(--risk-high)', lineHeight: 1.4, margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Quick result */}
        {quickResult && (
          <div style={{ marginTop: '16px' }}>
            {/* Score display */}
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px',
              }}>
                Risk Score
              </p>

              {/* Score ring */}
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-muted)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - quickResult.overall_risk_score / 100)}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s ease' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: scoreColor, letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {quickResult.overall_risk_score}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>/ 100</span>
                </div>
              </div>

              {/* Risk level badge */}
              <div style={{
                padding: '6px 14px',
                backgroundColor: scoreColor + '18',
                borderRadius: '8px',
                display: 'inline-block',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: scoreColor }}>
                  {quickResult.summary.risk_level} Risk
                </span>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '14px' }}>
                {[
                  { label: 'Clauses', value: quickResult.summary.total_clauses },
                  { label: 'Red Flags', value: quickResult.summary.red_flag_count },
                  { label: 'Time', value: `${quickResult.processing_time.toFixed(1)}s` },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    padding: '8px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px',
                  }}>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{value}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Verdict snippet */}
            <div style={{
              marginTop: '10px',
              padding: '10px 14px',
              backgroundColor: scoreColor + '10',
              border: `1px solid ${scoreColor}30`,
              borderRadius: '8px',
              borderLeft: `3px solid ${scoreColor}`,
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                {quickResult.summary.verdict.slice(0, 150)}{quickResult.summary.verdict.length > 150 ? '…' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ margin: '16px 0', borderTop: '1px solid var(--border-default)' }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={openSidePanel}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-geist)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            <CheckCircle size={14} color="var(--brand-primary)" />
            Open Risk Summary Panel
          </button>

          <button
            onClick={openNewTab}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-geist)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            <ExternalLink size={14} color="var(--brand-primary)" />
            Open Full Dashboard (New Tab)
          </button>
        </div>

        {/* Footer */}
        <p style={{
          marginTop: '14px',
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-tertiary)',
        }}>
          <FileText size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          For informational purposes only. Not legal advice.
        </p>
      </div>
    </div>
  )
}
