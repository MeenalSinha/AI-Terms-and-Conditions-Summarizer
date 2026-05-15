# LegalCopilot

![Build](https://img.shields.io/badge/build-passing-brightgreen) ![Python](https://img.shields.io/badge/python-3.10%2B-blue) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688) ![License](https://img.shields.io/badge/license-MIT-blue)

**AI-powered Terms & Conditions risk analyzer.** LegalCopilot parses legal documents, identifies risky clauses, scores overall risk, and lets users ask plain-language questions about what they're agreeing to — before they click "I Accept."

---

## Live Demo

> Local deployment only at this time. Follow the [Quick Start](#quick-start) guide to run the app on your machine.
>
> Hosted demo — coming soon.

---

## Features

- **Document Analysis** — Upload a PDF or paste raw text; the app segments the document into clauses and assigns each a risk level (Low / Medium / High / Critical) and a 0–100 risk score.
- **Risk Dashboard** — Visual summary showing overall risk score, risk distribution chart, red-flag banner, clause list, and a plain-English verdict.
- **AI Chat Assistant** — Ask questions about the document in natural language. Powered by Claude with a keyword-based fallback when the API is unavailable.
- **Document Comparison** — Paste two T&C documents side-by-side and get a category-by-category breakdown of which is safer.
- **Export** — Download the full analysis as a JSON data file or a human-readable `.txt` report.
- **Graceful Degradation** — Every AI call has a deterministic rule-based fallback, so the app works even without an Anthropic API key.
- **Chrome Extension**(new) - Now available as a chrome extension with Auto-extraction of T&C from webpage, so users can scan the page in just One-tap.
- **Sidebar**(new) - Also added alongside the extension, User can now veiw the risk score directly on a compact sidebar and then go to a new browser tab for full details.
---
## 🧩 Chrome Extension
LegalCopilot is now available as a fully functional Chrome Extension (Manifest V3), allowing users to analyze Terms & Conditions directly from the browser without navigating to a separate site.

### Extension Features
* **Quick Scan Popup:** Instantly scan the current webpage for legal risks and view a quick score by clicking the extension icon.
* **Risk Summary Side Panel:** A persistent side panel to view detailed risk distributions, key risks, and verdicts while you browse.
* **Smart Auto-Detection:** A background content script automatically detects if you navigate to a T&C or Privacy Policy page and offers to extract and analyze the text.
* **Full Dashboard:** Access the complete suite of tools—including clause comparison, AI chat, and export features—in a dedicated new tab.

### Extension Local Installation Instructions
1. Navigate to the extension directory: `cd extension`
2. Install the necessary dependencies: `npm install`
3. Build the extension package: `npm run build`
4. Open Google Chrome and navigate to `chrome://extensions/`
5. Toggle **Developer mode** ON in the top right corner.
6. Click **Load unpacked** and select the `Legal-Copilot/extension/dist` directory.

---
## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Chrome Extension (new) | Manifest V3, Vite, CRXJS, Service Workers, Chrome Storage API |
| Charts | Recharts |
| Animations | Framer Motion |
| HTTP client (frontend) | Axios |
| File upload | react-dropzone |
| Backend | FastAPI, Python 3.10+, Uvicorn |
| AI Engine | Anthropic Claude (`claude-sonnet-4-20250514`) with rule-based fallback |
| PDF parsing | pdfplumber (primary), PyPDF2 (fallback) |
| Data validation | Pydantic v2 |

---

## AI Model

LegalCopilot uses a **two-tier inference strategy** so the app remains functional with or without an API key:

| Tier | Engine | When Used |
|---|---|---|
| **Primary** | Anthropic Claude `claude-sonnet-4-20250514` | When `ANTHROPIC_API_KEY` is set and the API is reachable |
| **Fallback** | Rule-based keyword engine | API unavailable, rate-limited, or key not configured |

The rule-based fallback covers 50+ curated risk keywords across four severity levels and 15 legal clause categories. Clauses analysed via fallback return a lower `confidence` score (0.72 vs 0.85+) so the frontend can surface the distinction if needed.

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- An **Anthropic API key** (optional — the app runs with rule-based analysis without it)

---

## Quick Start

### Automated setup

```bash
# macOS / Linux
chmod +x setup.sh && ./setup.sh

# Windows
setup.bat
```

### Manual setup

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

python main.py
# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/api/docs
```

**Frontend**

```bash
cd frontend
npm install
# .env.local already points to http://localhost:8000/api
npm run dev
# App available at http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | `""` | Enables AI-powered clause analysis and chat |
| `HOST` | No | `0.0.0.0` | Uvicorn bind address |
| `PORT` | No | `8000` | Uvicorn port |
| `RELOAD` | No | `true` | Hot-reload on file changes |
| `LOG_LEVEL` | No | `info` | Logging verbosity |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | Backend base URL |

---

## API Reference

Full interactive docs are available at `http://localhost:8000/api/docs` when the backend is running.
(**Note: Both the Next.js web application and the Chrome Extension communicate with this same set of REST API endpoints.**)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/analyze` | Analyze a PDF or text file (multipart) |
| `POST` | `/api/analyze/text` | Analyze raw JSON text body |
| `GET` | `/api/document/{doc_id}` | Retrieve cached analysis by ID |
| `POST` | `/api/chat` | Chat with AI about a document |
| `POST` | `/api/compare` | Compare two documents |
| `POST` | `/api/export` | Export report as JSON or plain text |

---

## How Analysis Works

1. **Ingestion** — Text is extracted from the uploaded file (PDF via pdfplumber/PyPDF2, plain text directly),
 #**or can be now scraped directly from a live webpage via the Chrome Extension**(new), and then cleaned (whitespace normalization, page-number stripping).
2. **Segmentation** — The document is split into clauses using numbered-section patterns, paragraph breaks, or sentence chunking as fallbacks.
3. **AI Analysis** — Up to 20 clauses are sent to Claude in one batch with a structured prompt requesting category, risk level, risk score, plain-English impact, explanation, and red flags.
4. **Rule-based Fallback** — If the Claude API is unavailable or returns no result for a clause, keyword matching against curated risk dictionaries assigns category and risk level.
5. **Scoring** — An overall score is computed as a weighted average of individual clause scores, with Critical clauses weighted 4× and Low clauses weighted 1×.
6. **Caching** — Completed analyses are stored in an in-memory dict keyed by UUID, enabling the Chat and Export features to reference the same document without re-analysis.

---

## Supported File Types

- `.pdf` — Parsed with pdfplumber; falls back to PyPDF2
- `.txt` — UTF-8 plain text
- `.md` — Markdown (treated as plain text)

Maximum document size: **500,000 characters**.

---

## Project Structure

```
## Project Structure

```text
legalcopilot/
├── backend/
│   ├── main.py                  # FastAPI app, middleware, router registration
│   ├── requirements.txt
│   ├── .env.example
│   ├── models/
│   │   └── schemas.py           # Pydantic request/response models
│   ├── routers/
│   │   ├── analyze.py           # Document ingestion & analysis endpoints
│   │   ├── chat.py              # Conversational Q&A endpoint
│   │   ├── compare.py           # Side-by-side document comparison
│   │   ├── export.py            # Report download (JSON / TXT)
│   │   └── health.py            # Health check
│   ├── services/
│   │   ├── ai_service.py        # Claude API calls + rule-based fallback
│   │   └── document_service.py  # PDF extraction, text cleaning, validation
│   └── utils/
|
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── app/
│       │   ├── page.tsx         # Root page, view state machine
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── upload/          # UploadSection (drag-drop + paste)
│       │   ├── dashboard/       # Dashboard, RiskOverview, SummaryPanel, RedFlagBanner
│       │   ├── clauses/         # ClauseList
│       │   ├── chat/            # ChatAssistant
│       │   ├── comparison/      # CompareView
│       │   └── export/          # ExportPanel
│       ├── lib/
│       │   └── api.ts           # Typed Axios wrappers for all endpoints
│       └── types/
│           └── index.ts         # Shared TypeScript interfaces and enums
|
├── extension/                   # NEW: Chrome Extension (Manifest V3)
│   ├── manifest.json            # Extension configuration and permissions
│   ├── package.json
│   ├── vite.config.ts           # Vite + CRXJS bundler configuration
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   ├── icons/               # Extension icons (16, 32, 48, 128px)
│   │   └── fonts/               # Self-hosted fonts for CSP compliance
│   └── src/
│       ├── popup/               # Quick-action UI (Scan current page)
│       │   ├── index.html
│       │   ├── Popup.tsx
│       │   └── main.tsx
│       ├── sidepanel/           # Persistent risk summary dashboard
│       │   ├── index.html
│       │   ├── SidePanel.tsx
│       │   └── main.tsx
│       ├── newtab/              # Full dashboard experience (New Tab)
│       │   └── FullDashboard.tsx
│       ├── background/
│       │   └── service-worker.ts # Extension lifecycle, state, & message routing
│       ├── content/
│       │   └── content-script.ts # Auto-detects T&C pages & extracts page text
│       ├── components/          # Reused React components (copied from frontend)
│       ├── lib/
│       │   └── api.ts           # Adapted API calls (import.meta.env.VITE_API_URL)
│       ├── types/               # Copied TypeScript interfaces
│       └── styles/
│           └── globals.css      # Adapted CSS (self-hosted fonts, no @import)
├── setup.sh
├── setup.bat
└── README.md
```

---

## Limitations & Production Notes

- **In-memory document cache** — Analyzed documents are stored in a Python dict. Data is lost on restart. For production, replace with Redis or a database.
- **No authentication** — The API has no auth layer. Add OAuth2 or API key middleware before any public deployment.
- **CORS** — Currently allows only `localhost:3000`. Update `allow_origins` in `main.py` for your production domain.
- **Clause cap** — A maximum of 50 clauses are segmented per document and 20 are sent to Claude per request. Very long documents may have lower coverage.
- **Not legal advice** — LegalCopilot is an educational tool. It does not constitute legal advice and should not be used as a substitute for qualified legal counsel.

---

## License

See `LICENSE` for terms.
