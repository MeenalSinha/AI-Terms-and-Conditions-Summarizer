'use client'

import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

interface RedFlagBannerProps {
  criticalCount: number
  highCount: number
  verdict: string
}

export default function RedFlagBanner({ criticalCount, highCount, verdict }: RedFlagBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div style={{
      backgroundColor: '#fff7ed',
      border: '1px solid #fed7aa',
      borderRadius: '10px',
      padding: '14px 18px',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <AlertTriangle size={16} color="#dc2626" />
      </div>

      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#7c2d12', marginBottom: '2px' }}>
          Red Flag Alert —{' '}
          {criticalCount > 0 && `${criticalCount} Critical`}
          {criticalCount > 0 && highCount > 0 && ', '}
          {highCount > 0 && `${highCount} High-Risk`}
          {' '}Clause{(criticalCount + highCount) > 1 ? 's' : ''} Detected
        </p>
        <p style={{ fontSize: '13px', color: '#92400e' }}>{verdict}</p>
      </div>

      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#92400e',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
