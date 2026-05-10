'use client'

import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from '@/types'
import { sendChatMessage } from '@/lib/api'
import { Send, Loader2, MessageSquare, Bot, User } from 'lucide-react'
import toast from 'react-hot-toast'

interface ChatAssistantProps {
  documentContext?: string
  documentId?: string
}

const SUGGESTED_QUESTIONS = [
  'Is this document safe to agree to?',
  'Can they sell my personal data?',
  'What happens if I want to cancel?',
  'Do I have the right to delete my data?',
  'What is the arbitration clause about?',
  'Are there any hidden fees?',
]

export default function ChatAssistant({ documentContext }: ChatAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'I am your legal AI assistant. I have analyzed this document and can answer your questions about the Terms & Conditions in plain language. What would you like to know?',
      timestamp: new Date(),
      confidence: 1.0,
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
      const res = await sendChatMessage(text.trim(), documentContext, history)

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.response,
        timestamp: new Date(),
        confidence: res.confidence,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      toast.error('Chat failed. Is the backend running?')
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px', height: '620px' }}>
      {/* Chat window */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            backgroundColor: 'var(--brand-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={16} color="var(--brand-primary)" />
          </div>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Legal Assistant</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Online — document loaded</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: '10px',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: msg.role === 'user' ? 'var(--brand-light)' : 'var(--bg-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {msg.role === 'user'
                  ? <User size={14} color="var(--brand-primary)" />
                  : <Bot size={14} color="var(--text-secondary)" />
                }
              </div>

              {/* Bubble */}
              <div style={{ maxWidth: '80%' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  backgroundColor: msg.role === 'user' ? 'var(--brand-primary)' : 'var(--bg-subtle)',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  fontSize: '14px',
                  lineHeight: 1.55,
                }}>
                  {msg.content}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '4px',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.confidence !== undefined && msg.role === 'assistant' && (
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      Confidence: {(msg.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                backgroundColor: 'var(--bg-muted)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={14} color="var(--text-secondary)" />
              </div>
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '4px 12px 12px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <Loader2 size={13} color="var(--text-tertiary)" className="animate-spin" />
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Analyzing...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-default)',
          display: 'flex',
          gap: '8px',
        }}>
          <input
            type="text"
            placeholder="Ask about this document..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              fontSize: '14px',
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-geist)',
              outline: 'none',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: input.trim() && !isLoading ? 'var(--brand-primary)' : 'var(--bg-muted)',
              color: input.trim() && !isLoading ? 'white' : 'var(--text-tertiary)',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'var(--font-geist)',
            }}
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>

      {/* Suggested questions */}
      <div className="card" style={{ padding: '16px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <MessageSquare size={14} color="var(--text-secondary)" />
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Suggested Questions
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              disabled={isLoading}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: 1.4,
                cursor: 'pointer',
                fontFamily: 'var(--font-geist)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--brand-light)'
                e.currentTarget.style.borderColor = '#c0d1ff'
                e.currentTarget.style.color = 'var(--brand-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'var(--bg-subtle)'
                e.currentTarget.style.borderColor = 'var(--border-default)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
