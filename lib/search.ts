import { randomUUID } from "crypto";
import type { Listing, SpecInput, VerifiedListing } from "./schema";
import { LISTING_OUTPUT_SCHEMA } from "./schema";
import { SELLERS, agentGoal, type SellerConfig } from "./sellers";
import { startRun, getRun, cancelRun, fetchPages, search as tfSearch } from "./tinyfish";
import { extractFromMarkdown } from "./extract";
import { verifyAll } from "./verify";
import { readJson, writeJson, cachePath, demoPath, searchPath } from "./store";
import { FX_NOTE } from "./fx";

export type SellerStatus = "queued" | "running" | "done" | "failed" | "cached";

export interface SellerState {
  id: string;
  name: string;
  mode: "agent" | "fetch";
  isReference: boolean;
  status: SellerStatus;
  steps: number;
  note: string;
  startedAt: number;
  finishedAt: number | null;
  runId: string | null;
  streamingUrl: string | null;
  listing: Listing | null;
  source: "live" | "cached" | null;
}

export interface SearchJob {
  id: string;
  spec: SpecInput;
  createdAt: string;
  replay: { of: string } | null;
  sellers: SellerState[];
  status: "running" | "verifying" | "done";
  rows: VerifiedListing[] | null;
  reference: Listing | null;
  verifier: string | null;
  fxNote: string;
  error?: string;
}

// Survives Next dev hot reloads.
const g = globalThis as unknown as { __jobs?: Map<string, SearchJob> };
const jobs = (g.__jobs ??= new Map());

export function getJob(id: string): SearchJob | undefined {
  return jobs.get(id);
}

export function anyRunning(): boolean {
  return [...jobs.values()].some((j) => j.status !== "done" && !j.replay);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Agent results sometimes come wrapped; find the object that carries listing fields.
function unwrapAgentResult(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  if (Array.isArray(result)) {
    for (const item of result) { const found = unwrapAgentResult(item); if (found) return found; }
    return null;
  }
  const r = result as Record<string, unknown>;
  if ("stock" in r || "price_breaks" in r || "mpn" in r) return r;
  for (const v of Object.values(r)) {
    const inner = typeof v === "string" ? safeParse(v) : v;
    const found = unwrapAgentResult(inner);
    if (found) return found;
  }
  return null;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function runAgentSeller(cfg: SellerConfig, st: SellerState, mpn: string): Promise<Listing> {
  const url = cfg.url(mpn)!;
  const runId = await startRun(url, agentGoal(mpn), LISTING_OUTPUT_SCHEMA);
  st.runId = runId;
  st.note = "agent started";
  const deadline = Date.now() + cfg.timeoutMs;
  while (Date.now() < deadline) {
    await sleep(4000);
    const run = await getRun(runId).catch(() => null);
    if (!run) continue;
    st.steps = run.num_of_steps ?? run.steps?.length ?? st.steps;
    st.streamingUrl = run.streaming_url ?? st.streamingUrl;
    const action = run.steps?.at(-1)?.action;
    st.note = run.status === "PENDING" ? "waiting for browser" : action ?? "opening site";
    if (run.status === "COMPLETED") {
      const r = unwrapAgentResult(run.result);
      if (!r) throw new Error("agent finished without listing data");
      const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
      const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
      const prices = Array.isArray(r.price_breaks) ? r.price_breaks.filter((p) =>
        p && typeof p === "object" && Number.isSafeInteger(p.qty) && p.qty > 0 &&
        typeof p.unit_price === "number" && Number.isFinite(p.unit_price) && p.unit_price >= 0 &&
        typeof p.currency === "string") : [];
      let evidenceUrl = url;
      try { const parsed = new URL(String(r.url)); if (parsed.protocol === "https:" || parsed.protocol === "http:") evidenceUrl = parsed.href; } catch {}
      return {
        seller: cfg.name,
        seller_type: cfg.type,
        mpn: str(r.mpn),
        stock: count(r.stock),
        moq: count(r.moq),
        price_breaks: prices,
        lead_time: str(r.lead_time),
        package: str(r.package),
        temp_range: str(r.temp_range),
        lifecycle: str(r.lifecycle),
        url: evidenceUrl,
        read_at: new Date().toISOString(),
        extra_claims: null,
      };
    }
    if (run.status === "FAILED" || run.status === "CANCELLED") {
      throw new Error(`agent ${run.status.toLowerCase()}`);
    }
  }
  await cancelRun(runId);
  throw new Error(`timed out after ${Math.round(cfg.timeoutMs / 60000)} min`);
}

async function runFetchSeller(cfg: SellerConfig, st: SellerState, mpn: string): Promise<Listing> {
  let url = cfg.url(mpn);
  if (!url && cfg.searchDomain) {
    st.note = "finding product page via TinyFish Search";
    const res = await tfSearch(`${mpn} ${cfg.searchDomain}`);
    url = res.results?.find((r) => r.url.includes(cfg.searchDomain!))?.url ?? null;
  }
  if (!url) throw new Error("no product page found");
  st.note = "reading page";
  const res = await fetchPages([url], cfg.timeoutMs);
  const page = res.results?.[0];
  if (!page?.text) throw new Error(res.errors?.[0]?.error ?? "empty page");
  return extractFromMarkdown(typeof page.text === "string" ? page.text : JSON.stringify(page.text), {
    seller: cfg.name,
    seller_type: cfg.type,
    mpn,
    url: page.final_url || url,
    title: page.title,
  });
}

async function runSeller(cfg: SellerConfig, st: SellerState, mpn: string) {
  st.status = "running";
  st.startedAt = Date.now();
  try {
    // Rehearsal switch: FORCE_FAIL=digikey,lcsc makes those sellers fail so the cached fallback shows.
    if (process.env.FORCE_FAIL?.split(",").includes(cfg.id)) throw new Error("forced failure (rehearsal)");
    const listing = cfg.mode === "agent" ? await runAgentSeller(cfg, st, mpn) : await runFetchSeller(cfg, st, mpn);
    st.listing = listing;
    st.source = "live";
    st.status = "done";
    st.note = cfg.mode === "agent" ? `done in ${st.steps} steps` : "page read";
    await writeJson(cachePath(mpn, cfg.id), listing);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[search] ${cfg.id} failed:`, msg);
    const cached = await readJson<Listing>(cachePath(mpn, cfg.id));
    if (cached) {
      st.listing = cached;
      st.source = "cached";
      st.status = "cached";
      st.note = `live failed (${msg}); showing cached read`;
    } else {
      st.status = "failed";
      st.note = msg;
    }
  } finally {
    st.finishedAt = Date.now();
  }
}

function newSellerStates(): SellerState[] {
  return SELLERS.map((s) => ({
    id: s.id,
    name: s.name,
    mode: s.mode,
    isReference: !!s.isReference,
    status: "queued",
    steps: 0,
    note: "queued",
    startedAt: Date.now(),
    finishedAt: null,
    runId: null,
    streamingUrl: null,
    listing: null,
    source: null,
  }));
}

async function finish(job: SearchJob) {
  job.status = "verifying";
  const withListing = job.sellers.filter((s) => s.listing);
  job.reference = job.sellers.find((s) => s.isReference)?.listing ?? null;
  const out = await verifyAll(
    withListing.map((s) => ({ listing: s.listing!, source: s.source ?? "live" })),
    job.spec,
    job.reference,
    !!job.replay,
  );
  job.rows = out.rows;
  job.verifier = out.verifier;
  job.status = "done";
  await writeJson(searchPath(job.id), job);
  // Keep the latest all-live run as the demo replay.
  if (!job.replay && job.sellers.every((s) => s.source === "live")) await writeJson(demoPath(job.spec.mpn), job);
}

export function startSearch(spec: SpecInput): SearchJob {
  const job: SearchJob = {
    id: randomUUID(),
    spec,
    createdAt: new Date().toISOString(),
    replay: null,
    sellers: newSellerStates(),
    status: "running",
    rows: null,
    reference: null,
    verifier: null,
    fxNote: FX_NOTE,
  };
  jobs.set(job.id, job);
  const mpn = spec.mpn.trim().toUpperCase();
  Promise.allSettled(SELLERS.map((cfg, i) => runSeller(cfg, job.sellers[i], mpn)))
    .then(() => finish(job))
    .catch((e) => {
      console.error("[search] finish failed", e);
      job.error = "Verification failed. Please retry the search.";
      job.status = "done";
    });
  return job;
}

// Replays a recorded run with staggered timing so the UI looks like the live flow.
export async function startReplay(spec: SpecInput): Promise<SearchJob | null> {
  const recorded = await readJson<SearchJob>(demoPath(spec.mpn.trim().toUpperCase()));
  if (!recorded) return null;
  const job: SearchJob = {
    ...recorded,
    spec,
    createdAt: new Date().toISOString(),
    reference: null,
    verifier: null,
    id: randomUUID(),
    replay: { of: recorded.createdAt },
    sellers: newSellerStates(),
    status: "running",
    rows: null,
  };
  jobs.set(job.id, job);
  const delays: Record<string, number> = { st: 1500, dna: 2500, lcsc: 7000, digikey: 10000 };
  job.sellers.forEach((st) => {
    const rec = recorded.sellers.find((r) => r.id === st.id)!;
    st.status = "running";
    st.note = "replaying recorded run";
    const total = delays[st.id] ?? 3000;
    const tick = setInterval(() => {
      if (st.mode === "agent" && st.steps < rec.steps) st.steps++;
    }, total / Math.max(rec.steps, 1));
    setTimeout(() => {
      clearInterval(tick);
      Object.assign(st, rec, { startedAt: st.startedAt, finishedAt: Date.now(), streamingUrl: null });
    }, total);
  });
  setTimeout(() => {
    void finish(job).catch((e) => {
      console.error("[replay] verification failed", e);
      job.error = "Verification failed. Please retry the search.";
      job.status = "done";
    });
  }, 11000);
  return job;
}
