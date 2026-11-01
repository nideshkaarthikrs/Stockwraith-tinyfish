# Stockwraith setup and QA report

Date: 1 November 2026

## Environment

Cloned into `Stockwraith-tinyfish` under the requested workspace. Dependencies installed with Node 24.10.0 / npm 11.6.2. Production server: http://localhost:3000.

## Fixed issues

| Issue | Fix / coverage |
|---|---|
| Production prerender fails on client `Date.now()` | Start clock at a stable value; update after mount; clamp elapsed time. Production build passes. |
| Turbopack CSS subprocess crashes on this Windows setup | Use Webpack for build/dev and standard Tailwind PostCSS integration. |
| README references missing `.env.example` | Add template and allow it through gitignore; create ignored `.env.local`. |
| Replay ignores changed quantity/package/temperature | Apply current spec and recompute verdicts, prices and rankings offline. Browser tested at quantity 1,000,000. |
| Replay elapsed times include time since recording | Preserve current start times, clear old streaming URLs, retain evidence read times. |
| Replay could replace original demo recording | Only all-live non-replay searches update demo fixtures. |
| Invalid JSON/null request causes server error; invalid quantities silently accepted | Return 400 for malformed bodies, invalid quantity, missing fields, invalid ranges and replay types. |
| Search request gap permits repeated submission; network rejection leaves no useful recovery | Track submission state, catch request/poll failures, clean intervals on unmount. Browser tested. |
| Watch network failure leaves controls busy | Catch failures and reset busy state in finally; handle initial load errors. Browser tested. |
| Missing watch dismiss returns success; typo modes act as real checks | Return 404 / 400 consistently. |
| Watch creation accepts missing fields/arbitrary URLs | Validate fields and restrict supported targets to ST eStore HTTPS URLs. |
| Concurrent watch writes can lose changes/create duplicate paid monitors | Serialize mutation operations within the local process. Mocked duplicate requests create one monitor. |
| Unknown stock check hides later restock transition | Compare against last confirmed real stock state. |
| Demo simulation prevents repeated alert demonstrations | Simulated checks do not replace real baseline. Tested simulation/dismiss/repeat. |
| MOQ exceeds requested quantity but listing can remain green | Downgrade to needs-check. |
| Price quoted from a tier above requested quantity | Return unknown price when no tier applies. |
| `Inactive` matches the old `active` substring check | Require exact Active lifecycle. |
| Unicode minus misreads negative temperature as positive | Normalize minus sign. |
| Fetch extraction accepts MPN prefix of another variant | Require a full part-number token. |
| Agent payload strings/invalid numbers can crash verifier/UI | Normalize listing text, numeric counts, price tiers and evidence URL protocols. |
| Wrapped agent arrays only inspect first element | Search every result object. |
| Malformed Gemini response crashes verification | Validate array and verdict structure, fall back to rules. |
| Gemini reason can contradict stricter code verdict | Preserve rule reason when Gemini attempts a more lenient verdict. |
| All sellers failed produces an unexplained blank table | Show explicit no-listings message; empty-result API tested. |
| Verification exception silently finishes without results | Expose job error for UI display. |

## Validation

- `npm test`: 8 passing tests, including mocked parallel TinyFish agent/fetch/search success and complete watch lifecycle.
- `npm run test:e2e`: 6 passing tests against the production build using Edge: replay/changed quantity/mobile layout, malformed requests and missing records, four-seller cached fallback, network error recovery, stock simulation/dismiss/repeat/live-check failure, and uncached all-seller failure.
- Production build and ESLint checked. Browser replay test also asserts no page errors and no mobile document overflow; screenshot saved locally in ignored `test-results/mobile.png`.
- Original fixtures were preserved during offline tests; the successful all-live search subsequently refreshed the cache and demo recording as intended. Test watch data is restored after each lifecycle test.

## Real API verification

After keys were configured locally:

- A real search completed with all four sellers marked live (job `fdd82232-675c-41be-a9e4-902b5c014c11`). DigiKey returned 7,061 units and an exact match. LCSC returned stock but did not confirm the MPN, so remained amber. ST was sold out. DNA was red for conflicting temperature and flash claims against ST's reference.
- Real TinyFish monitor creation succeeded for the ST page, followed by a successful live check showing out of stock. Simulation created a clearly labelled alert; dismissal succeeded. The monitor remains configured on its hourly schedule.
- Real Gemini review of saved live listings succeeded using fallback after the primary model timed out. Verifier reported `Gemini + rules` and preserved all deterministic verdicts.
- Repeat live search `ed4766ea-f71d-4823-a169-75b7a2591ac3` completed: DigiKey, DNA and ST were live; LCSC agent failed and its previous read appeared as cached. DigiKey recovered after a verification screen and completed in 19 steps. The complete sanitized listing result is retained locally in ignored `data/live-qa.json`.
- Browser tests now start their own server on port 3100 with keys blank and FORCE_FAIL enabled, preventing accidental paid calls when `.env.local` contains real keys.

## Pending / limitations

- Live seller reads and monitor creation/checks were exercised with configured credentials. Seller pages and anti-bot challenges can still change; cache fallback is retained and visibly labelled. Not every possible account-limit or timeout condition was reproduced against the paid service.
- Gemini model listing and fallback review were verified with the configured key. The primary model timed out during one check; fallback succeeded.
- Stock Watch updates local history when Check now is used. Scheduled remote monitor execution is not ingested automatically into the local UI; background notifications need an additional polling/webhook design.
- JSON storage and in-memory jobs are designed for a single local server process. Running searches cannot resume after restart; multi-instance persistence and a durable job queue are outside the current local architecture.
- npm audit reports 16 moderate development-tool dependency findings traced to minimatch in the ESLint dependency tree. Automatic fixes suggest incompatible downgrades; these were not applied. `npm audit --omit=dev` reports zero production vulnerabilities.
- This is coverage of implemented workflows and targeted edge cases, not a claim that every possible external-site state or bug has been exhausted.
