import { useState, useEffect } from 'react'
import { AnalyzeResponse } from '@/types'
import Header from '@/components/Header'
import UploadSection from '@/components/upload/UploadSection'
import Dashboard from '@/components/dashboard/Dashboard'

type View = 'home' | 'results'

export default function FullDashboard() {
  const [view, setView] = useState<View>('home')
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null)
  const [documentText, setDocumentText] = useState<string>('')

  // Load last analysis from chrome.storage on mount
  useEffect(() => {
    const loadFromStorage = async () => {
      try {
        const data = await chrome.storage.local.get(['lastAnalysis', 'lastAnalysisTitle'])
        if (data.lastAnalysis) {
          setAnalysisResult(data.lastAnalysis)
          setDocumentText(data.lastAnalysisTitle || 'Scanned Document')
          setView('results')
        }
      } catch (err) {
        console.error('Failed to load stored analysis:', err)
      }
    }
    loadFromStorage()
  }, [])

  const handleAnalysisComplete = (result: AnalyzeResponse, text: string) => {
    setAnalysisResult(result)
    setDocumentText(text)
    setView('results')

    // Save to chrome.storage for side panel access
    chrome.storage.local.set({
      lastAnalysis: result,
      lastAnalysisTitle: text,
      lastAnalysisTime: Date.now(),
    }).catch(console.error)
  }

  const handleReset = () => {
    setView('home')
    setAnalysisResult(null)
    setDocumentText('')
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Header
        onHome={handleReset}
        onCompare={() => {}}
        currentView={view}
      />

      <main>
        {view === 'home' && (
          <UploadSection onAnalysisComplete={handleAnalysisComplete} />
        )}

        {view === 'results' && analysisResult && (
          <Dashboard
            result={analysisResult}
            documentText={documentText}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  )
}
