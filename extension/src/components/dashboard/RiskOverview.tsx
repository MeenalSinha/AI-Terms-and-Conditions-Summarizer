'use client'

import { AnalyzeResponse, RiskLevel, RISK_COLORS } from '@/types'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface RiskOverviewProps {
  result: AnalyzeResponse
}

const RISK_LEVELS: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical']

export default function RiskOverview({ result }: RiskOverviewProps) {
  const { risk_distribution, clauses, overall_risk_score } = result

  const pieData = [
    { name: 'Critical', value: risk_distribution.critical, color: RISK_COLORS.Critical },
    { name: 'High', value: risk_distribution.high, color: RISK_COLORS.High },
    { name: 'Medium', value: risk_distribution.medium, color: RISK_COLORS.Medium },
    { name: 'Low', value: risk_distribution.low, color: RISK_COLORS.Low },
  ].filter(d => d.value > 0)

  // Category breakdown
  const categoryMap: Record<string, Record<RiskLevel, number>> = {}
  clauses.forEach(c => {
    if (!categoryMap[c.category]) {
      categoryMap[c.category] = { Low: 0, Medium: 0, High: 0, Critical: 0 }
    }
    categoryMap[c.category][c.risk_level]++
  })

  const barData = Object.entries(categoryMap)
    .map(([cat, counts]) => ({
      category: cat.replace(' & ', '/').replace('Changes to ', '').slice(0, 18),
      ...counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => (b.Critical + b.High) - (a.Critical + a.High))
    .slice(0, 8)

  // Score gauge
  const scoreColor = overall_risk_score >= 70
    ? RISK_COLORS.Critical
    : overall_risk_score >= 50
    ? RISK_COLORS.High
    : overall_risk_score >= 30
    ? RISK_COLORS.Medium
    : RISK_COLORS.Low

  const riskLabel = overall_risk_score >= 70 ? 'Critical Risk'
    : overall_risk_score >= 50 ? 'High Risk'
    : overall_risk_score >= 30 ? 'Moderate Risk'
    : 'Low Risk'

  const circumference = 2 * Math.PI * 54
  const offset = circumference - (overall_risk_score / 100) * circumference

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Row 1: Score + Pie */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px' }}>
        {/* Score gauge */}
        <div className="card" style={{ padding: '28px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '20px' }}>
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
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '36px', fontWeight: 800, color: scoreColor, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {overall_risk_score}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>/ 100</span>
            </div>
          </div>

          <div style={{
            marginTop: '16px',
            padding: '8px 16px',
            backgroundColor: scoreColor + '18',
            borderRadius: '8px',
            display: 'inline-block',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: scoreColor }}>
              {riskLabel}
            </span>
          </div>

          {/* Distribution mini-stats */}
          <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Critical', count: risk_distribution.critical, color: RISK_COLORS.Critical },
              { label: 'High', count: risk_distribution.high, color: RISK_COLORS.High },
              { label: 'Medium', count: risk_distribution.medium, color: RISK_COLORS.Medium },
              { label: 'Low', count: risk_distribution.low, color: RISK_COLORS.Low },
            ].map(({ label, count, color }) => (
              <div key={label} style={{
                padding: '8px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                borderLeft: `3px solid ${color}`,
              }}>
                <p style={{ fontSize: '18px', fontWeight: 700, color, letterSpacing: '-0.03em' }}>{count}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pie chart */}
        <div className="card" style={{ padding: '28px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Risk Distribution
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-geist)',
                }}
                formatter={(value: any, name: any) => [`${value} clauses`, name]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '13px', fontFamily: 'var(--font-geist)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Bar chart by category */}
      <div className="card" style={{ padding: '28px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
          Risk by Category
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 0, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-geist)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-geist)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'var(--font-geist)',
              }}
            />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-geist)' }} />
            <Bar dataKey="Critical" fill={RISK_COLORS.Critical} stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="High" fill={RISK_COLORS.High} stackId="a" />
            <Bar dataKey="Medium" fill={RISK_COLORS.Medium} stackId="a" />
            <Bar dataKey="Low" fill={RISK_COLORS.Low} stackId="a" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row 3: Risk timeline */}
      <div className="card" style={{ padding: '28px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
          Risk Timeline Through Document
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
          {clauses.map((clause, i) => {
            const h = clause.risk_score / 100 * 80
            const color = RISK_COLORS[clause.risk_level]
            return (
              <div
                key={clause.id}
                title={`Clause ${i + 1}: ${clause.category} — ${clause.risk_level} (${clause.risk_score})`}
                style={{
                  flex: 1,
                  height: `${h}px`,
                  backgroundColor: color,
                  borderRadius: '3px 3px 0 0',
                  opacity: 0.85,
                  minWidth: '4px',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.85')}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Beginning of document</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>End of document</span>
        </div>
      </div>
    </div>
  )
}
