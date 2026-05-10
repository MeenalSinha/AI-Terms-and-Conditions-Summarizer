import axios from 'axios'
import { AnalyzeResponse, ComparisonResult } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
})

export async function analyzeFile(file: File, modelType: string = 'mistral', onProgress?: (p: number) => void): Promise<AnalyzeResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('document_name', file.name)
  formData.append('model_type', modelType)

  const response = await api.post('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 30) / e.total))
      }
    },
  })
  return response.data
}

export async function analyzeText(text: string, name?: string, modelType: string = 'mistral'): Promise<AnalyzeResponse> {
  const response = await api.post('/analyze/text', { text, document_name: name || 'Pasted Document', model_type: modelType })
  return response.data
}

export async function sendChatMessage(
  message: string,
  context?: string,
  history?: Array<{ role: string; content: string }>
): Promise<{ response: string; confidence: number }> {
  const response = await api.post('/chat', {
    message,
    document_context: context,
    conversation_history: history || [],
  })
  return response.data
}

export async function compareDocuments(
  docAText: string,
  docBText: string,
  docAName: string,
  docBName: string,
  modelType: string = 'mistral'
): Promise<ComparisonResult> {
  const response = await api.post('/compare', {
    document_a_text: docAText,
    document_b_text: docBText,
    document_a_name: docAName,
    document_b_name: docBName,
    model_type: modelType
  })
  return response.data
}

export async function exportReport(analysisData: any, format: string = 'text'): Promise<Blob> {
  const response = await api.post('/export', { analysis_data: analysisData, format }, {
    responseType: 'blob',
  })
  return response.data
}

export async function checkHealth(): Promise<boolean> {
  try {
    await api.get('/health')
    return true
  } catch {
    return false
  }
}
