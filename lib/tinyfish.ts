// Thin HTTP client for TinyFish (docs.tinyfish.ai). Auth: X-API-Key.
const AGENT_BASE = "https://agent.tinyfish.ai/v1";
const FETCH_URL = "https://api.fetch.tinyfish.ai";
const SEARCH_URL = "https://api.search.tinyfish.ai";

function key(): string {
  const k = process.env.TINYFISH_API_KEY;
  if (!k) throw new Error("TINYFISH_API_KEY missing in .env.local");
  return k;
}

async function call<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "X-API-Key": key(), "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`TinyFish ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Run {
  run_id: string;
  status: RunStatus;
  num_of_steps: number | null;
  result: Record<string, unknown> | null;
  error: unknown;
  streaming_url: string | null;
  steps?: { action?: string; status?: string; timestamp?: string }[];
}

export async function startRun(url: string, goal: string, outputSchema?: object): Promise<string> {
  const r = await call<{ run_id: string | null; error?: unknown }>(`${AGENT_BASE}/automation/run-async`, {
    method: "POST",
    body: JSON.stringify({ url, goal, output_schema: outputSchema }),
  });
  if (!r.run_id) throw new Error(`run-async failed: ${JSON.stringify(r.error)}`);
  return r.run_id;
}

export function getRun(runId: string): Promise<Run> {
  return call<Run>(`${AGENT_BASE}/runs/${runId}`);
}

export async function cancelRun(runId: string): Promise<void> {
  await call(`${AGENT_BASE}/runs/${runId}/cancel`, { method: "POST" }).catch(() => {});
}

export interface FetchResult {
  url: string;
  final_url: string;
  title: string | null;
  text: string | null;
}

export async function fetchPages(urls: string[], timeoutMs = 45_000): Promise<{
  results: FetchResult[];
  errors: { url: string; error: string }[];
}> {
  return call(FETCH_URL, {
    method: "POST",
    body: JSON.stringify({ urls, format: "markdown", ttl: 0, per_url_timeout_ms: timeoutMs - 5_000 }),
  }, timeoutMs);
}

export async function search(query: string) {
  return call<{ results: { title: string; url: string; snippet?: string }[] }>(
    `${SEARCH_URL}?query=${encodeURIComponent(query)}`,
  );
}

export interface MonitorRun {
  outcome?: string;
  results?: FetchResult[];
  errors?: unknown[];
  judgment?: { is_relevant?: boolean; summary?: string };
}

export async function createMonitor(url: string, purpose: string, name: string) {
  return call<{ monitor: { id: string; status: string }; run: MonitorRun }>(`${AGENT_BASE}/monitors`, {
    method: "POST",
    body: JSON.stringify({
      type: "fetch",
      name,
      purpose,
      config: { url, format: "markdown" },
      schedule_cron: "0 * * * *",
    }),
  }, 90_000);
}

export async function runMonitor(id: string) {
  return call<{ run: MonitorRun }>(`${AGENT_BASE}/monitors/${id}/runs`, { method: "POST" }, 90_000);
}
