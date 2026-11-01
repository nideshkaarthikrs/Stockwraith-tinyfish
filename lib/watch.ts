import { createMonitor, runMonitor, type MonitorRun } from "./tinyfish";
import { readJson, writeJson, WATCH_PATH } from "./store";

export interface WatchCheck {
  at: string;
  inStock: boolean | null;
  evidence: string;
  simulated?: boolean;
}

export interface Watch {
  id: string; // TinyFish monitor id
  mpn: string;
  seller: string;
  url: string;
  createdAt: string;
  checks: WatchCheck[];
  alert: WatchCheck | null;
}

export async function listWatches(): Promise<Watch[]> {
  return (await readJson<Watch[]>(WATCH_PATH)) ?? [];
}

async function save(ws: Watch[]) {
  await writeJson(WATCH_PATH, ws);
}

// Reads stock state from the page text the monitor captured.
function readStock(run: MonitorRun): WatchCheck {
  const text = run.results?.[0]?.text;
  const page = typeof text === "string" ? text : JSON.stringify(text ?? "");
  const at = new Date().toISOString();
  if (/Out of Stock/i.test(page)) return { at, inStock: false, evidence: "page shows “Out of Stock”" };
  if (/In Stock|Add to cart|Buy now/i.test(page)) return { at, inStock: true, evidence: "page shows the part as buyable" };
  return { at, inStock: null, evidence: run.judgment?.summary ?? "stock state unclear" };
}

// Serialize read-modify-write operations so concurrent checks do not overwrite watches.
const state = globalThis as unknown as { __watchQueue?: Promise<unknown> };
function exclusive<T>(action: () => Promise<T>): Promise<T> {
  const next = (state.__watchQueue ?? Promise.resolve()).then(action, action);
  state.__watchQueue = next.catch(() => {});
  return next;
}

async function addWatchUnlocked(mpn: string, seller: string, url: string): Promise<Watch> {
  const ws = await listWatches();
  const existing = ws.find((w) => w.url === url);
  if (existing) return existing;
  const r = await createMonitor(url, `Alert when ${mpn} changes from Out of Stock to in stock or a quantity appears.`, `Stockwraith · ${mpn} @ ${seller}`);
  const w: Watch = { id: r.monitor.id, mpn, seller, url, createdAt: new Date().toISOString(), checks: [readStock(r.run)], alert: null };
  await save([...ws, w]);
  return w;
}

async function checkWatchUnlocked(id: string, simulate: boolean): Promise<Watch | null> {
  const ws = await listWatches();
  const w = ws.find((x) => x.id === id);
  if (!w) return null;
  const check: WatchCheck = simulate
    ? { at: new Date().toISOString(), inStock: true, evidence: "SIMULATED restock for demo", simulated: true }
    : readStock((await runMonitor(id)).run);
  const prev = [...w.checks].reverse().find((c) => c.inStock !== null && !c.simulated);
  w.checks = [...w.checks, check].slice(-10);
  if (check.inStock && prev?.inStock === false) w.alert = check;
  await save(ws);
  return w;
}

async function clearAlertUnlocked(id: string) {
  const ws = await listWatches();
  const w = ws.find((x) => x.id === id);
  if (w) {
    w.alert = null;
    await save(ws);
  }
  return !!w;
}

export function addWatch(mpn: string, seller: string, url: string) {
  return exclusive(() => addWatchUnlocked(mpn, seller, url));
}
export function checkWatch(id: string, simulate: boolean) {
  return exclusive(() => checkWatchUnlocked(id, simulate));
}
export function clearAlert(id: string) {
  return exclusive(() => clearAlertUnlocked(id));
}
