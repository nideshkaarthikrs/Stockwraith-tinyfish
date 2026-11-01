# Stockwraith: 60-second demo script

**Before going on stage:** `npm run dev`, open http://localhost:3000, and have the form pre-filled (it is by default). Keep a second tab on the same page with **Replay** ticked as a backup.

---

**[0:00] Hook.** "Octopart shows you what distributors report. Stockwraith reads the live page and checks it against your spec."

**[0:05] Problem.** "When your usual supplier runs out of a chip, the stock still exists somewhere: Indian sellers, the manufacturer's own store. Buyers open 30 tabs and read datasheets to find it."

**[0:12] Click *Hunt stock*** (STM32F103C8T6 · LQFP-48 · −40 to +85 °C · qty 500).
"Four TinyFish agents start in parallel. LCSC and DigiKey are full web agents. Watch them search the site and open the product page." *(Point at the step text changing; optionally click "Watch the agent live".)* "DNA Techindia and ST's own store are read with TinyFish Fetch in about two seconds."

**[0:30] Results** (arrive in about 2 minutes. While waiting, talk through the cards. If short on time, use the Replay tab.)
- "LCSC: green. Exact package, industrial temperature, 42,000 in stock, ₹86 a unit at 500."
- "DNA Techindia: **red**. The page claims −40 to +105 °C and 128 KB of Flash. ST's own page says this exact part is −40 to +85 °C and 64 KB. Octopart would never catch that."
- "Every number links to the page it came from, with the time it was read."

**[0:48] Stock Watch.** "ST's own store is sold out. A TinyFish monitor watches that page." *Click **Check now*** to show the real "still out of stock" result, then *click **Simulate restock (demo)*** and the alert appears. "The moment it's back, we know."

**[0:58] Close.** "Remove TinyFish and this product doesn't exist. Stockwraith: hidden inventory, with proof."

---

## If something breaks
- **Wifi or site down:** tick **Replay last recorded live run** and click Hunt stock. Say: "This is the live run we recorded at 1:47 PM."
- **One seller fails live:** its row shows a **cached** badge with the last real read. Say: "One slow site never blocks the rest."
- **Live search already running (409):** wait for it to finish, or use the Replay tab.
- **Budget:** each live search costs about $0.50 of TinyFish credit. Rehearse with Replay.
