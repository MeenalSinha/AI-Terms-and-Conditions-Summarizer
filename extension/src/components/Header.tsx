'use client'

import { Shield, GitCompare, Home, ChevronRight } from 'lucide-react'

interface HeaderProps {
  onHome: () => void
  onCompare: () => void
  currentView: string
}

export default function Header({ onHome, onCompare, currentView }: HeaderProps) {
  return (
    <header style={{
      backgroundColor: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-default)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 24px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <button
          onClick={onHome}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'var(--brand-primary)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Shield size={18} color="white" strokeWidth={2} />
          </div>
          <span style={{
            fontWeight: 700,
            fontSize: '17px',
            color: 'var(--text-primary)',
            letterSpacing: '-0.03em',
          }}>
            LegalCopilot
          </span>
        </button>

        {/* Breadcrumb for results */}
        {currentView === 'results' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-tertiary)',
            fontSize: '13px',
          }}>
            <span>Home</span>
            <ChevronRight size={14} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Analysis Results</span>
          </div>
        )}

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentView !== 'home' && (
            <button
              onClick={onHome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font-geist)',
              }}
            >
              <Home size={14} />
              Home
            </button>
          )}

          <button
            onClick={onCompare}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              backgroundColor: currentView === 'compare' ? 'var(--brand-light)' : 'transparent',
              color: currentView === 'compare' ? 'var(--brand-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-geist)',
            }}
          >
            <GitCompare size={14} />
            Compare Docs
          </button>

          <a
            href="http://localhost:8000/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: 'var(--brand-primary)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: '-0.01em',
            }}
          >
            API Docs
          </a>
        </nav>
      </div>
    </header>
  )
}
