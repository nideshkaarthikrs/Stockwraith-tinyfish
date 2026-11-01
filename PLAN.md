# Stockwraith — build plan (12:30 → 4:00 PM IST, Sun 1 Nov 2026)

## Context
Hackathon finale. A user enters an MPN plus required specs. TinyFish reads 4 seller pages in parallel (agent runs for LCSC and DigiKey, Fetch for DNA Techindia and the ST eStore). The ST eStore page is also the reference spec. An LLM checks each listing against that spec, and the app shows a ranked table with evidence links. A TinyFish monitor powers Stock Watch on the out-of-stock ST page. Demo reliability matters more than breadth. The project folder holds only the deck. It sits inside the parent workspace repo, so I'll `git init` a new repo in `Stockwraith/` with remote `nideshkaarthikrs/Stockwraith-tinyfish`.

## Stack check (verified against the live docs today)
1. **Next.js ↔ TinyFish: OK.** Plain HTTP with an `X-API-Key` header. Calls: `POST agent.tinyfish.ai/v1/automation/run-async` with `{url, goal, output_schema}` returns `run_id`, then poll `GET /v1/runs/{id}` (status PENDING/RUNNING/COMPLETED/FAILED, plus `num_of_steps`, `result`, `streaming_url`). Fetch is `POST api.fetch.tinyfish.ai {urls, format:"markdown", ttl}`. Monitors use `POST /v1/monitors {type:"fetch", config:{url}, schedule_cron, purpose}`, and run-now is `POST /v1/monitors/{id}/runs`. An npm SDK exists (`@tiny-fish/sdk`), but I'll use raw fetch because it has fewer unknowns. Live progress comes from `num_of_steps` and status, and the `streaming_url` can show a live browser view.
2. **SQLite: swapped for JSON files.** You're on macOS arm64 with Node 24. `better-sqlite3` needs a native build, and `node:sqlite` is experimental and Next's bundler may not handle it. Plain JSON files in `data/` have zero risk, which is enough at our scale.
3. **Gemini:** the current recommended models are `gemini-3.8-flash`, with `gemini-3.5-flash-lite` as the fallback model. The official rate-limit page no longer publishes free-tier numbers ("view your active limits in AI Studio"), so please glance at AI Studio. Our usage is **1 call per search** (extraction of the fetched pages plus verification of all listings, with JSON schema output), roughly 30 calls for the whole day, which fits any free tier. On a 429, fall back to `flash-lite`, then to the pure-code rule verifier.
4. **Other demo risks:**
   - TinyFish allows only **2 concurrent agent runs** on this account, which matches our 2 (LCSC and DigiKey). Never launch a second search while one is running.
   - Monitor results arrive by webhook, which needs a public URL a laptop doesn't have. I'll poll with **run-now** from the UI instead.
   - Venue wifi: cover it with the replay switch.
   - Budget: about $0.50 per live search, so dev runs use the cache by default.

## Step 0 (first action after approval)
Save this plan as `Stockwraith/PLAN.md` in the project folder. It goes into the first commit.

## Milestones (commit after each)
| Time | Milestone |
|---|---|
| 12:40–1:00 | **M0** Scaffold Next.js (TS, Tailwind), `.env.local`, `lib/tinyfish.ts`, schema, JSON store. Smoke-test Fetch on the ST page. |
| 1:00–1:40 | **M1** One seller end to end: DNA Techindia (Fetch → extract → table row with link and timestamp). |
| 1:40–2:25 | **M2** All 4 sellers in parallel. Add LCSC and DigiKey agent runs with polling, a per-seller progress card, a per-site timeout (LCSC 4 min, DigiKey 5 min, Fetch 30 s), and a per-seller "cached" fallback. |
| 2:25–2:55 | **M3** Verification. Code rules (MPN suffix, package, temp range, stock vs qty, MOQ/price-break consistency) plus one Gemini call for reasons and extraction. Green/amber/red, INR normalisation, ranking. |
| 2:55–3:15 | **M4** Stock Watch: create a monitor on the ST page, a "Check now" button (run-now), and an alert banner when the stock text changes. |
| **3:15** | **Feature freeze.** Record the full live run as `data/demo/STM32F103C8T6.json`, add the Replay toggle, write the README, fix bugs, write the 60-second script, rehearse twice. |

## Structure
```
app/page.tsx                      search form + progress cards + results table + Stock Watch panel
app/api/search/route.ts           POST {mpn,package,temp,qty} → starts all sellers, returns searchId
app/api/search/[id]/route.ts      GET → per-seller status/steps + listings + verdicts (UI polls every 3 s)
app/api/watch/route.ts            POST create monitor · GET list
app/api/watch/[id]/check/route.ts POST run-now → returns {inStock, changed, text}
lib/tinyfish.ts                   startRun, getRun, fetchPages, createMonitor, runMonitor
lib/sellers.ts                    per-seller config: mode (agent|fetch), url builder, goal text, seller_type
lib/verify.ts                     code rules + one Gemini call + fallback; ranking
lib/fx.ts                         fixed USD→INR rate shown in UI ("rate as of 1 Nov")
lib/store.ts                      JSON read/write: data/searches/, data/cache/<mpn>/<seller>.json, data/watch.json
lib/schema.ts                     shared Listing type + JSON schema for output_schema
```
The search orchestration runs in-process (a module-level Map of jobs). It kicks off promises without awaiting them, and the GET route reads their state. That works fine for `next dev` and `next start` on one laptop.

## Shared listing schema
`seller, seller_type ("authorised"|"broker"|"manufacturer_store"), mpn, stock, moq, price_breaks[{qty, unit_price, currency}], lead_time, package, temp_range, lifecycle, url, read_at`. Every field is nullable, and both the agent goal and the Gemini prompt say "null if not shown, never guess". The app adds `source: "live"|"cached"`, `verdict: "green"|"amber"|"red"`, `reason`, `unit_price_inr`, and `rank`.

Expected demo verdicts:
- **LCSC:** green.
- **DigiKey:** amber (MOQ 250 next to a qty-1 price, so the packaging variant needs checking).
- **DNA Techindia:** red (page claims −40 to +105 °C and 128 KB, which conflicts with the ST reference).
- **ST eStore:** reference row, out of stock, and the Stock Watch target.

## Choices I made (no questions blocking)
- **Fetch-only seller (DNA) goes first for M1**, because it's fast and free to iterate on. Agent sellers come in M2.
- **Stock Watch alert:** the ST part won't actually restock during the demo, so the panel shows the real monitor and its last real check ("still out of stock"). It also gets a **"Simulate restock (demo)"** button, clearly labelled, that replays the alert path. Tell me if you'd rather drop it.
- **You need to provide:** `TINYFISH_API_KEY` and `GEMINI_API_KEY` in `Stockwraith/.env.local` (I'll create `.env.example`, and `.env*` is gitignored).

## Verification
- Run `npm run dev` and search STM32F103C8T6 / LQFP-48 / −40..85 °C / qty 500. All 4 cards should show live progress, and the table should show 3 ranked rows plus the reference, with working links and timestamps.
- Kill the wifi and turn on Replay: the same table loads from `data/demo`.
- Force one seller to time out: its row shows a "cached" badge.
- Stock Watch "Check now" returns the real ST page status.
