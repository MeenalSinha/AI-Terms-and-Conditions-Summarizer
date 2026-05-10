/// <reference types="chrome" />

// Background service worker for LegalCopilot extension
// Handles extension lifecycle, message routing, and side panel behavior

// Open side panel when extension icon is clicked (if user holds Alt)
chrome.runtime.onInstalled.addListener(() => {
  // Set side panel behavior — enabled on all sites
  chrome.sidePanel.setOptions({
    enabled: true,
  })

  console.log('[LegalCopilot] Extension installed.')
})

// Handle messages from popup, side panel, and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_SIDE_PANEL':
      if (sender.tab?.id) {
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(console.error)
      }
      sendResponse({ success: true })
      break

    case 'OPEN_NEW_TAB':
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/newtab/index.html'),
      })
      sendResponse({ success: true })
      break

    case 'TC_PAGE_DETECTED':
      // Content script detected a T&C page — show badge
      if (sender.tab?.id) {
        chrome.action.setBadgeText({ text: 'T&C', tabId: sender.tab.id })
        chrome.action.setBadgeBackgroundColor({ color: '#2a3ee8', tabId: sender.tab.id })
        chrome.action.setTitle({
          title: 'LegalCopilot — Terms & Conditions detected! Click to scan.',
          tabId: sender.tab.id,
        })
      }
      sendResponse({ success: true })
      break

    default:
      sendResponse({ error: 'Unknown message type' })
  }

  return true // Keep sendResponse channel open for async responses
})
