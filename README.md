# Stockwraith

**Finds the supply chain's hidden inventory, with proof.**
Built for *Swim with TinyFish* (Scaler School of Technology) by Team Moorthi Annan Gang.

Type an electronic part number and your required specs. TinyFish web agents read seller pages live, in parallel. Every listing is checked against the manufacturer's own spec, and you get a ranked table where every number links to the page it came from.

> Octopart shows you what distributors report. Stockwraith reads the live page and checks it against your spec.

## How TinyFish powers it
| TinyFish product | Used for |
|---|---|
| **Web Agent** (`run-async` + polling) | LCSC and DigiKey India. The agent searches the site, opens the exact product page and returns stock, MOQ, price breaks, package, temperature range and lifecycle as JSON (`output_schema`). Each agent step is shown live in the UI. |
| **Fetch** | DNA Techindia (an Indian seller Octopart doesn't list) and the ST eStore. The ST eStore is the manufacturer store and also serves as the **reference spec**. |
| **Search** | Finds a seller's product page when we don't already know its URL. |
| **Monitor** | Stock Watch. A page monitor on the sold-out ST eStore page, with a "Check now" button that triggers an immediate run. |

Remove TinyFish and the product does not exist.

## Verification
1. **Code rules (deterministic):** exact MPN including suffix, package family and pin count, temperature range, stock vs. quantity needed, MOQ vs. price-break consistency, lifecycle, and conflicting claims vs. the manufacturer (for example Flash size).
2. **One Gemini call per search** (`gemini-3.8-flash`, falling back to `gemini-3.5-flash-lite`, then rules only). It writes the one-line reason and can only make a verdict stricter, never more lenient.
3. Result: 🟢 exact match · 🟠 needs a check · 🔴 mismatch. Prices are converted to INR at a fixed rate shown in the UI. Unknown fields stay unknown and are never guessed.

## Reliability
- All sellers run in parallel, each with its own timeout (LCSC 4 min, DigiKey 5 min, Fetch 45 s).
- If a seller fails live, its last successful read is shown, clearly labelled **cached**.
- Every fully live run is recorded to `data/demo/<MPN>.json`. The **Replay** switch plays it back offline.

## Run it
```bash
cp .env.example .env.local   # add TINYFISH_API_KEY and GEMINI_API_KEY
npm ci
npm run dev                  # http://localhost:3000
```
Rehearsal: `FORCE_FAIL=digikey npm run dev` makes a seller fail so you can see the cached fallback.

## Stack
Next.js 16 (TypeScript, App Router, Tailwind) as one app for the UI and API routes · TinyFish REST API · Gemini API (free tier) · JSON files for storage (no native modules, nothing to break on demo day). Runs locally.

## Layout
```
app/page.tsx, app/StockWatch.tsx     UI
app/api/search, app/api/watch        API routes
lib/tinyfish.ts                      TinyFish client (agent, fetch, search, monitor)
lib/sellers.ts                       seller configs + agent goal
lib/search.ts                        parallel orchestration, cache fallback, replay
lib/extract.ts                       Fetch markdown → listing
lib/verify.ts                        rules + Gemini + ranking
```

## Local verification

Node.js 24 and npm 11 were used on Windows. Development and production builds use Webpack to avoid a Turbopack CSS subprocess crash on this setup. Tailwind uses the PostCSS integration.

```bash
npm test             # rules, mocked TinyFish orchestration and watch lifecycle
npm run lint
npm run build
npm start            # production app at http://localhost:3000
npm run test:e2e     # starts an isolated production test server on port 3100
```

Browser tests use installed Microsoft Edge. The browser suite starts a test server on port 3100 with API keys explicitly blank and sellers forced to fail: it deliberately tests fallback and monitor failures without spending credits, even when local keys are configured. It temporarily seeds and restores `data/watch.json`; do not use Stock Watch concurrently with these tests. Tests never use paid API services. Replay re-verifies recorded listings against the submitted spec using offline rules, preserving the original evidence timestamps.

For real seller searches and monitors, set `TINYFISH_API_KEY` in `.env.local` and restart the server. `GEMINI_API_KEY` is optional; deterministic rules work without it. No keys are committed.

See [QA_REPORT.md](QA_REPORT.md) for fixes, coverage and remaining limitations.
