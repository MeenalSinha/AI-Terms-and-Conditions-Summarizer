'use client'

import { useState } from 'react'
import { compareDocuments } from '@/lib/api'
import { ComparisonResult, RISK_COLORS } from '@/types'
import { ArrowLeft, GitCompare, Loader2, CheckCircle, AlertTriangle, Award } from 'lucide-react'
import toast from 'react-hot-toast'

interface CompareViewProps {
  onBack: () => void
}

export default function CompareView({ onBack }: CompareViewProps) {
  const [docAText, setDocAText] = useState('')
  const [docBText, setDocBText] = useState('')
  const [docAName, setDocAName] = useState('Document A')
  const [docBName, setDocBName] = useState('Document B')
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [isComparing, setIsComparing] = useState(false)

  const handleCompare = async () => {
    if (docAText.trim().length < 100 || docBText.trim().length < 100) {
      toast.error('Each document must have at least 100 characters.')
      return
    }
    setIsComparing(true)
    try {
      const res = await compareDocuments(docAText, docBText, docAName, docBName)
      setResult(res)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Comparison failed. Is the backend running?')
    } finally {
      setIsComparing(false)
    }
  }

  const scoreColor = (score: number) =>
    score >= 70 ? RISK_COLORS.Critical
      : score >= 50 ? RISK_COLORS.High
      : score >= 30 ? RISK_COLORS.Medium
      : RISK_COLORS.Low

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            border: '1px solid var(--border-default)',
            backgroundColor: 'transparent', color: 'var(--text-secondary)',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            fontFamily: 'var(--font-geist)',
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.03em' }}>Document Comparison</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Compare two T&C documents to find which is safer for users
          </p>
        </div>
      </div>

      {/* Input area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {[
          { label: docAName, setLabel: setDocAName, text: docAText, setText: setDocAText, placeholder: 'Paste Document A (Terms & Conditions)...' },
          { label: docBName, setLabel: setDocBName, text: docBText, setText: setDocBText, placeholder: 'Paste Document B (Terms & Conditions)...' },
        ].map(({ label, setLabel, text, setText, placeholder }, i) => (
          <div key={i} className="card" style={{ padding: '20px' }}>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-geist)',
                outline: 'none',
                marginBottom: '10px',
              }}
            />
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%',
                height: '240px',
                padding: '12px',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-subtle)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
              {text.length.toLocaleString()} characters
            </p>
          </div>
        ))}
      </div>

      {/* Compare button */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <button
          onClick={handleCompare}
          disabled={isComparing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '13px 32px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: isComparing ? 'var(--bg-muted)' : 'var(--brand-primary)',
            color: isComparing ? 'var(--text-tertiary)' : 'white',
            fontSize: '15px',
            fontWeight: 700,
            cursor: isComparing ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-geist)',
            letterSpacing: '-0.01em',
          }}
        >
          {isComparing ? <Loader2 size={18} className="animate-spin" /> : <GitCompare size={18} />}
          {isComparing ? 'Comparing...' : 'Compare Documents'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Winner banner */}
          <div style={{
            padding: '20px 24px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}>
            <Award size={32} color="#16a34a" />
            <div>
              <p style={{ fontSize: '18px', fontWeight: 800, color: '#14532d', letterSpacing: '-0.03em' }}>
                {result.safer_document} is safer
              </p>
              <p style={{ fontSize: '14px', color: '#15803d', marginTop: '2px' }}>
                {result.winner_explanation}
              </p>
            </div>
          </div>

          {/* Score comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              { name: docAName, score: result.document_a_score },
              { name: docBName, score: result.document_b_score },
            ].map(({ name, score }) => {
              const isSafer = result.safer_document === name
              const color = scoreColor(score)
              return (
                <div key={name} className="card" style={{
                  padding: '24px',
                  textAlign: 'center',
                  borderTop: `4px solid ${isSafer ? '#16a34a' : color}`,
                }}>
                  {isSafer && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
                      <CheckCircle size={14} color="#16a34a" />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Recommended
                      </span>
                    </div>
                  )}
                  {!isSafer && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
                      <AlertTriangle size={14} color={color} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Higher Risk
                      </span>
                    </div>
                  )}
                  <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>{name}</p>
                  <p style={{ fontSize: '48px', fontWeight: 800, color, letterSpacing: '-0.05em', lineHeight: 1 }}>
                    {score}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Risk Score / 100</p>

                  {/* Progress bar */}
                  <div style={{
                    marginTop: '16px',
                    height: '6px',
                    backgroundColor: 'var(--bg-muted)',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${score}%`,
                      backgroundColor: color,
                      borderRadius: '9999px',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Category comparison table */}
          {result.comparison_points.length > 0 && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Category Breakdown
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {result.comparison_points.slice(0, 8).map((point, i) => {
                  const aWins = point.winner === docAName
                  return (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: '8px',
                    }}>
                      {/* Doc A score */}
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: aWins ? '#16a34a' : scoreColor(point.doc_a_score),
                        }}>
                          {point.doc_a_score}
                        </span>
                        {aWins && <CheckCircle size={12} color="#16a34a" style={{ marginLeft: '4px', display: 'inline' }} />}
                      </div>

                      {/* Category */}
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {point.category}
                        </span>
                      </div>

                      {/* Doc B score */}
                      <div style={{ textAlign: 'left' }}>
                        {!aWins && <CheckCircle size={12} color="#16a34a" style={{ marginRight: '4px', display: 'inline' }} />}
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: !aWins ? '#16a34a' : scoreColor(point.doc_b_score),
                        }}>
                          {point.doc_b_score}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '12px',
                marginTop: '12px',
                padding: '8px 14px',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>{docAName}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>vs</p>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left' }}>{docBName}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
