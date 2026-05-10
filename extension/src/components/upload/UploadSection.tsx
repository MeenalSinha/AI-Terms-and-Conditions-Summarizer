'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, AlertCircle, Loader2, CheckCircle, Shield, Zap, BarChart2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { analyzeFile, analyzeText } from '@/lib/api'
import { AnalyzeResponse } from '@/types'

const SAMPLE_TEXT = `1. Data Collection and Use
We collect information you provide directly to us, including name, email address, phone number, and payment information. We also automatically collect usage data, device information, IP addresses, and location data when you use our services.

2. Data Sharing with Third Parties
We may share your personal information with third-party business partners, advertisers, and analytics providers. We may also sell aggregated or de-identified data to third parties for their business purposes. By using our service, you consent to this sharing.

3. Mandatory Arbitration and Class Action Waiver
YOU AGREE THAT ANY DISPUTE ARISING FROM THESE TERMS SHALL BE RESOLVED EXCLUSIVELY THROUGH BINDING ARBITRATION. YOU WAIVE YOUR RIGHT TO A JURY TRIAL AND YOUR RIGHT TO PARTICIPATE IN CLASS ACTION LAWSUITS.

4. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED $100.

5. Account Termination
We reserve the right to suspend or terminate your account at any time, for any reason, without notice or liability to you. We may delete all your data upon termination.

6. Changes to Terms
We may modify these Terms at any time. Your continued use of the service after changes constitutes your acceptance. We will attempt to provide 7 days notice for material changes.

7. Intellectual Property License
By posting content, you grant us a worldwide, irrevocable, royalty-free, perpetual license to use, reproduce, modify, distribute, and sublicense your content for any purpose, including commercial purposes.

8. Governing Law and Jurisdiction
These Terms shall be governed by the laws of Delaware, USA. All disputes shall be brought exclusively in courts located in Wilmington, Delaware.

9. User Privacy Rights
You may request access to, correction of, or deletion of your personal data by contacting our privacy team. We will respond within 30 days. California residents have additional rights under CCPA.

10. Cookie Policy
We use cookies and similar tracking technologies to track activity on our Service. You can control cookie settings through your browser. Disabling cookies may affect service functionality.`

interface UploadSectionProps {
  onAnalysisComplete: (result: AnalyzeResponse, text: string) => void
}

export default function UploadSection({ onAnalysisComplete }: UploadSectionProps) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload')
  const [pastedText, setPastedText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const simulateProgress = async (onDone: () => void) => {
    const steps = [
      { pct: 20, label: 'Parsing document...' },
      { pct: 40, label: 'Segmenting clauses...' },
      { pct: 65, label: 'Running AI analysis...' },
      { pct: 85, label: 'Scoring risks...' },
      { pct: 95, label: 'Generating summary...' },
    ]
    for (const step of steps) {
      setProgress(step.pct)
      setProgressLabel(step.label)
      await new Promise(r => setTimeout(r, 400))
    }
    onDone()
  }

  const handleAnalyze = async () => {
    if (!uploadedFile && !pastedText.trim()) {
      toast.error('Please upload a file or paste text to analyze.')
      return
    }
    if (mode === 'paste' && pastedText.trim().length < 100) {
      toast.error('Please paste at least 100 characters of text.')
      return
    }

    setIsAnalyzing(true)
    setProgress(5)
    setProgressLabel('Starting analysis...')

    let result: AnalyzeResponse | null = null
    let docText = pastedText

    const progressDone = new Promise<void>(resolve => {
      simulateProgress(resolve)
    })

    try {
      const analysisPromise = mode === 'upload' && uploadedFile
        ? analyzeFile(uploadedFile, setProgress)
        : analyzeText(pastedText)

      const [res] = await Promise.all([analysisPromise, progressDone])
      result = res

      if (mode === 'upload' && uploadedFile) {
        docText = `[PDF: ${uploadedFile.name}]`
      }

      setProgress(100)
      setProgressLabel('Complete!')
      await new Promise(r => setTimeout(r, 500))

      toast.success(`Analyzed ${result.summary.total_clauses} clauses in ${result.processing_time.toFixed(1)}s`)
      onAnalysisComplete(result, docText)
    } catch (err: any) {
      console.error(err)
      const msg = err?.response?.data?.detail || 'Analysis failed. Is the backend running?'
      toast.error(msg)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setUploadedFile(accepted[0])
      setMode('upload')
      toast.success(`${accepted[0].name} ready for analysis`)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'], 'text/markdown': ['.md'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: isAnalyzing,
  })

  const loadSample = () => {
    setPastedText(SAMPLE_TEXT)
    setMode('paste')
    toast.success('Sample T&C loaded')
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 14px',
          backgroundColor: 'var(--brand-light)',
          border: '1px solid #c0d1ff',
          borderRadius: '9999px',
          marginBottom: '20px',
        }}>
          <Zap size={13} color="var(--brand-primary)" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)' }}>
            AI-Powered Legal Risk Analysis
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 700,
          letterSpacing: '-0.04em',
          color: 'var(--text-primary)',
          lineHeight: 1.1,
          marginBottom: '16px',
        }}>
          Know What You're
          <br />
          <span style={{ color: 'var(--brand-primary)' }}>Agreeing To</span>
        </h1>

        <p style={{
          fontSize: '17px',
          color: 'var(--text-secondary)',
          maxWidth: '520px',
          margin: '0 auto 32px',
          lineHeight: 1.6,
        }}>
          Upload any Terms & Conditions or Privacy Policy. Our AI analyzes every clause,
          flags risks, and explains what it means for you — in plain language.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { icon: Shield, text: 'Risk Detection' },
            { icon: BarChart2, text: 'Visual Dashboard' },
            { icon: FileText, text: 'Clause Analysis' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              fontWeight: 500,
            }}>
              <Icon size={13} color="var(--brand-primary)" />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="card" style={{ padding: '32px' }}>
        {/* Mode tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '10px',
          padding: '4px',
          marginBottom: '24px',
        }}>
          {(['upload', 'paste'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={isAnalyzing}
              style={{
                flex: 1,
                padding: '8px 16px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: mode === m ? 'var(--bg-surface)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: mode === m ? 600 : 400,
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: 'var(--font-geist)',
                boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {m === 'upload' ? 'Upload File' : 'Paste Text'}
            </button>
          ))}
        </div>

        {/* Upload zone */}
        {mode === 'upload' && (
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--brand-primary)' : uploadedFile ? '#16a34a' : 'var(--border-default)'}`,
              borderRadius: '10px',
              padding: '48px 24px',
              textAlign: 'center',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              backgroundColor: isDragActive ? 'var(--brand-light)' : uploadedFile ? 'var(--risk-low-bg)' : 'var(--bg-subtle)',
              transition: 'all 0.2s',
            }}
          >
            <input {...getInputProps()} />
            {uploadedFile ? (
              <>
                <CheckCircle size={40} color="var(--risk-low)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{uploadedFile.name}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {(uploadedFile.size / 1024).toFixed(0)} KB — Click or drop to replace
                </p>
              </>
            ) : (
              <>
                <Upload size={40} color={isDragActive ? 'var(--brand-primary)' : 'var(--text-tertiary)'} style={{ margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  PDF, TXT, or MD — up to 10 MB
                </p>
              </>
            )}
          </div>
        )}

        {/* Paste text */}
        {mode === 'paste' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Paste Terms & Conditions Text
              </label>
              <button
                onClick={loadSample}
                disabled={isAnalyzing}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--brand-primary)',
                  backgroundColor: 'var(--brand-light)',
                  border: '1px solid #c0d1ff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-geist)',
                }}
              >
                Load Sample
              </button>
            </div>
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="Paste the full Terms & Conditions or Privacy Policy text here..."
              disabled={isAnalyzing}
              style={{
                width: '100%',
                height: '260px',
                padding: '14px',
                border: '1px solid var(--border-default)',
                borderRadius: '10px',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-subtle)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
              {pastedText.length.toLocaleString()} characters
              {pastedText.length < 100 && pastedText.length > 0 && (
                <span style={{ color: 'var(--risk-high)', marginLeft: '8px' }}>
                  (minimum 100 characters required)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Progress bar */}
        {isAnalyzing && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                {progressLabel}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)' }}>
                {progress}%
              </span>
            </div>
            <div style={{
              height: '6px',
              backgroundColor: 'var(--bg-muted)',
              borderRadius: '9999px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: 'var(--brand-primary)',
                borderRadius: '9999px',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || (mode === 'upload' ? !uploadedFile : pastedText.trim().length < 100)}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: isAnalyzing ? 'var(--bg-muted)' : 'var(--brand-primary)',
            color: isAnalyzing ? 'var(--text-tertiary)' : 'white',
            fontSize: '15px',
            fontWeight: 700,
            cursor: isAnalyzing || (mode === 'upload' ? !uploadedFile : pastedText.trim().length < 100) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-geist)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s',
          }}
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Shield size={18} />
              Analyze Document
            </>
          )}
        </button>
      </div>

      {/* Info footer */}
      <div style={{
        marginTop: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        color: 'var(--text-tertiary)',
        fontSize: '12px',
      }}>
        <AlertCircle size={12} />
        <span>For informational purposes only. Not legal advice.</span>
      </div>
    </div>
  )
}
