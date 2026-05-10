'use client'

import { useState } from 'react'
import { AnalyzedClause, RiskLevel, RISK_COLORS, RISK_BG_COLORS, RISK_BORDER_COLORS } from '@/types'
import { ChevronDown, ChevronRight, Search, Filter, AlertTriangle, Info } from 'lucide-react'

interface ClauseListProps {
  clauses: AnalyzedClause[]
}

type FilterLevel = 'All' | RiskLevel

const CONFIDENCE_BAR_COLOR = (c: number) =>
  c >= 0.8 ? '#16a34a' : c >= 0.6 ? '#b45309' : '#dc2626'

function ClauseCard({ clause, index }: { clause: AnalyzedClause; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const color = RISK_COLORS[clause.risk_level]
  const bg = RISK_BG_COLORS[clause.risk_level]
  const border = RISK_BORDER_COLORS[clause.risk_level]

  return (
    <div
      style={{
        border: `1px solid ${expanded ? border : 'var(--border-default)'}`,
        borderRadius: '10px',
        backgroundColor: expanded ? bg : 'var(--bg-surface)',
        overflow: 'hidden',
        transition: 'all 0.2s',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        borderLeft: `4px solid ${color}`,
      }}>
        {/* Index */}
        <div style={{
          minWidth: '26px',
          height: '26px',
          borderRadius: '6px',
          backgroundColor: color + '18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
          color,
          flexShrink: 0,
        }}>
          {index + 1}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: color + '18',
              color,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {clause.risk_level}
            </span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: 'var(--bg-muted)',
              color: 'var(--text-secondary)',
            }}>
              {clause.category}
            </span>
            <span style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              fontWeight: 500,
            }}>
              Score: {clause.risk_score}/100
            </span>
            {clause.red_flags.length > 0 && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#fef2f2',
                color: '#dc2626',
              }}>
                <AlertTriangle size={10} />
                {clause.red_flags.length} flag{clause.red_flags.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <p style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {clause.text}
          </p>
        </div>

        {/* Expand toggle */}
        <div style={{ flexShrink: 0, color: 'var(--text-tertiary)', paddingTop: '2px' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          padding: '16px',
          borderTop: `1px solid ${border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {/* User impact */}
          <div style={{
            padding: '12px',
            backgroundColor: color + '10',
            borderRadius: '8px',
            border: `1px solid ${border}`,
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              User Impact
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 500 }}>
              {clause.user_impact}
            </p>
          </div>

          {/* Explanation */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Info size={13} color="var(--text-tertiary)" />
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Plain Language Explanation
              </p>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {clause.explanation}
            </p>
          </div>

          {/* Red flags */}
          {clause.red_flags.length > 0 && (
            <div>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--risk-high)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                Red Flag Phrases
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {clause.red_flags.map((flag, i) => (
                  <span key={i} style={{
                    padding: '3px 10px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#dc2626',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Confidence */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              AI Confidence:
            </span>
            <div style={{
              flex: 1,
              height: '4px',
              backgroundColor: 'var(--bg-muted)',
              borderRadius: '9999px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${clause.confidence * 100}%`,
                backgroundColor: CONFIDENCE_BAR_COLOR(clause.confidence),
                borderRadius: '9999px',
              }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: CONFIDENCE_BAR_COLOR(clause.confidence) }}>
              {(clause.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClauseList({ clauses }: ClauseListProps) {
  const [filter, setFilter] = useState<FilterLevel>('All')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'order' | 'risk'>('risk')

  const filtered = clauses
    .filter(c => filter === 'All' || c.risk_level === filter)
    .filter(c =>
      !search ||
      c.text.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'risk') {
        const order = { Critical: 0, High: 1, Medium: 2, Low: 3 }
        return order[a.risk_level] - order[b.risk_level]
      }
      return 0
    })

  const counts = {
    All: clauses.length,
    Critical: clauses.filter(c => c.risk_level === 'Critical').length,
    High: clauses.filter(c => c.risk_level === 'High').length,
    Medium: clauses.filter(c => c.risk_level === 'Medium').length,
    Low: clauses.filter(c => c.risk_level === 'Low').length,
  }

  return (
    <div>
      {/* Controls */}
      <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
            <Search size={14} color="var(--text-tertiary)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search clauses or categories..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '13px',
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-geist)',
                outline: 'none',
              }}
            />
          </div>

          {/* Risk filter */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['All', 'Critical', 'High', 'Medium', 'Low'] as FilterLevel[]).map(level => {
              const isActive = filter === level
              const color = level === 'All' ? 'var(--brand-primary)' : RISK_COLORS[level as RiskLevel]
              return (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '7px',
                    border: `1px solid ${isActive ? color : 'var(--border-default)'}`,
                    backgroundColor: isActive ? color + '18' : 'transparent',
                    color: isActive ? color : 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 400,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-geist)',
                  }}
                >
                  {level} ({counts[level] || 0})
                </button>
              )
            })}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={13} color="var(--text-tertiary)" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                padding: '6px 10px',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-geist)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="risk">Sort by Risk</option>
              <option value="order">Sort by Order</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '10px', fontWeight: 500 }}>
        Showing {filtered.length} of {clauses.length} clauses
      </p>

      {/* Clause cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>No clauses match your filter.</p>
          </div>
        ) : (
          filtered.map((clause, i) => (
            <ClauseCard key={clause.id} clause={clause} index={clauses.indexOf(clause)} />
          ))
        )}
      </div>
    </div>
  )
}
