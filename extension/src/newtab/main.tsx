import React from 'react'
import ReactDOM from 'react-dom/client'
import FullDashboard from './FullDashboard'
import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FullDashboard />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#ffffff',
          color: '#0f1623',
          border: '1px solid #e2e6ed',
          borderRadius: '10px',
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          fontFamily: 'DM Sans, sans-serif',
        },
      }}
    />
  </React.StrictMode>,
)
