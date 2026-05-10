/// <reference types="chrome" />

// Content script for LegalCopilot extension
// Injected into web pages to extract text and detect T&C pages

// Keywords that indicate a Terms & Conditions / Privacy Policy page
const TC_KEYWORDS = [
  'terms of service',
  'terms and conditions',
  'terms of use',
  'privacy policy',
  'cookie policy',
  'data processing',
  'end user license agreement',
  'eula',
  'acceptable use policy',
  'user agreement',
  'subscriber agreement',
  'community guidelines',
  'privacy notice',
  'data protection',
  'gdpr',
  'ccpa',
]

const TITLE_KEYWORDS = [
  'terms',
  'privacy',
  'policy',
  'legal',
  'conditions',
  'agreement',
  'eula',
  'tos',
  'cookie',
]

/**
 * Check if the current page looks like a Terms & Conditions or Privacy Policy.
 */
function detectTCPage(): boolean {
  const title = document.title.toLowerCase()
  const url = window.location.href.toLowerCase()
  const h1Elements = document.querySelectorAll('h1, h2')

  // Check title
  if (TITLE_KEYWORDS.some(kw => title.includes(kw))) return true

  // Check URL path
  const urlPatterns = ['/terms', '/privacy', '/legal', '/tos', '/eula', '/policy', '/conditions']
  if (urlPatterns.some(p => url.includes(p))) return true

  // Check headings
  for (const heading of h1Elements) {
    const text = heading.textContent?.toLowerCase() || ''
    if (TC_KEYWORDS.some(kw => text.includes(kw))) return true
  }

  return false
}

/**
 * Extract the main text content of the page.
 * Tries to find the main content area and strips navigation/footer noise.
 */
function extractPageText(): string {
  // Try common content selectors first
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '#content',
    '.main-content',
    '#main-content',
    '.legal-content',
    '.terms-content',
    '.policy-content',
  ]

  let contentElement: Element | null = null
  for (const selector of contentSelectors) {
    contentElement = document.querySelector(selector)
    if (contentElement && contentElement.textContent && contentElement.textContent.trim().length > 200) {
      break
    }
    contentElement = null
  }

  // Fall back to body if no specific content area found
  const el = contentElement || document.body

  // Clone to avoid modifying the actual page
  const clone = el.cloneNode(true) as Element

  // Remove noise elements
  const noiseSelectors = [
    'script', 'style', 'noscript', 'iframe',
    'nav', 'footer', 'header',
    '.cookie-banner', '.cookie-consent',
    '.popup', '.modal', '.overlay',
    '.sidebar', '.menu', '.navigation',
    '.ad', '.advertisement',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  ]
  noiseSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove())
  })

  // Get cleaned text
  let text = clone.textContent || ''

  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()

  return text
}

// Listen for messages from popup and background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_TEXT':
      const text = extractPageText()
      sendResponse({
        text,
        url: window.location.href,
        title: document.title,
        isTCPage: detectTCPage(),
      })
      break

    case 'CHECK_TC_PAGE':
      sendResponse({ isTCPage: detectTCPage() })
      break

    default:
      sendResponse({ error: 'Unknown message type' })
  }

  return true
})

// Auto-detect T&C pages and notify the background script
if (detectTCPage()) {
  chrome.runtime.sendMessage({ type: 'TC_PAGE_DETECTED' }).catch(() => {
    // Extension context might not be ready yet, ignore
  })
}
