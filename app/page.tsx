"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchJob, SellerState } from "@/lib/search";
import type { VerifiedListing } from "@/lib/schema";
import StockWatch from "./StockWatch";

const DEFAULT = { mpn: "STM32F103C8T6", package: "LQFP-48", temp_range: "-40 to +85 °C", qty: 500 };

export default function Home() {
  const [form, setForm] = useState(DEFAULT);
  const [replay, setReplay] = useState(false);
  const [job, setJob] = useState<SearchJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
    setJob(null);
    if (poll.current) clearInterval(poll.current);
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, replay }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "search failed");
    const tick = async () => {
      try {
      const r = await fetch(`/api/search/${data.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Could not load search results. Please retry.");
      const j = (await r.json()) as SearchJob;
      setJob(j);
      if (j.error) setError(j.error);
      if (j.status === "done" && poll.current) clearInterval(poll.current);
      } catch (e) {
        if (poll.current) clearInterval(poll.current);
        setJob(null);
        setError(e instanceof Error ? e.message : "Could not load results");
      }
    };
    poll.current = setInterval(tick, 2000);
    await tick();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search request failed");
    } finally { setSubmitting(false); }
  }

  const busy = submitting || (job !== null && job.status !== "done");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-block rounded-full border border-teal-300/60 px-3 py-0.5 text-xs font-semibold tracking-wide text-teal-300">
            POWERED BY TINYFISH WEB AGENTS
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-50">Stockwraith</h1>
          <p className="mt-1 text-lg text-teal-300">Finds the supply chain&apos;s hidden inventory, with proof.</p>
        </div>
        <p className="max-w-md text-sm text-slate-400">
          Octopart shows you what distributors report. Stockwraith reads the live page and checks it
          against your spec, including Indian sellers and the manufacturer&apos;s own store.
        </p>
      </header>

      <form onSubmit={run} className="card mb-6 grid grid-cols-2 gap-3 p-4 md:grid-cols-[2fr_1fr_1.3fr_0.8fr_auto] md:items-end">
        <Field label="Part number (MPN)" value={form.mpn} onChange={(v) => setForm({ ...form, mpn: v })} className="col-span-2 md:col-span-1" />
        <Field label="Package" value={form.package} onChange={(v) => setForm({ ...form, package: v })} />
        <Field label="Temperature range" value={form.temp_range} onChange={(v) => setForm({ ...form, temp_range: v })} />
        <Field label="Quantity" value={String(form.qty)} onChange={(v) => setForm({ ...form, qty: Number(v) || 0 })} />
        <div className="col-span-2 flex items-center gap-3 md:col-span-1">
          <button disabled={busy} className="rounded-lg bg-teal-300 px-5 py-2.5 font-semibold text-slate-950 hover:bg-teal-200 disabled:opacity-50">
            {busy ? "Hunting…" : "Hunt stock"}
          </button>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400 md:col-span-5">
          <input type="checkbox" checked={replay} onChange={(e) => setReplay(e.target.checked)} />
          Replay last recorded live run (offline-safe demo mode)
        </label>
      </form>

      {error && <p className="mb-4 rounded-lg border border-red-400/40 bg-red-950/40 p-3 text-red-300">{error}</p>}

      {job && (
        <>
          {job.replay && (
            <p className="mb-3 text-sm text-amber-300">
              Replaying recorded live run from {new Date(job.replay.of).toLocaleString()}.
            </p>
          )}
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {job.sellers.map((s) => (
              <SellerCard key={s.id} s={s} now={now} />
            ))}
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 px-4 py-3">
              <h2 className="font-semibold text-slate-100">
                Verified results · {job.spec.mpn} · {job.spec.package} · {job.spec.temp_range} · qty {job.spec.qty}
              </h2>
              <span className="text-xs text-slate-400">
                {job.status === "running" && "Waiting for agents…"}
                {job.status === "verifying" && "Verifying against spec…"}
                {job.status === "done" && `Verifier: ${job.verifier} · ${job.fxNote}`}
              </span>
            </div>
            {job.rows ? <ResultsTable rows={job.rows} qty={job.spec.qty} /> : <PendingRows job={job} />}
          </section>
          <Legend />
        </>
      )}

      <StockWatch />
    </main>
  );
}

function Field(p: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-slate-400 ${p.className ?? ""}`}>
      {p.label}
      <input
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-base text-slate-100 outline-none focus:border-teal-300"
      />
    </label>
  );
}

const STATUS_STYLE: Record<SellerState["status"], string> = {
  queued: "text-slate-400",
  running: "text-sky-300",
  done: "text-teal-300",
  cached: "text-amber-300",
  failed: "text-red-400",
};

function SellerCard({ s, now }: { s: SellerState; now: number }) {
  const secs = Math.max(0, Math.round(((s.finishedAt ?? now) - s.startedAt) / 1000));
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-slate-100">{s.name}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
          {s.isReference ? "reference · fetch" : s.mode === "agent" ? "web agent" : "fetch"}
        </span>
      </div>
      <div className={`flex items-center gap-2 text-sm ${STATUS_STYLE[s.status]}`}>
        {s.status === "running" && <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />}
        <span className="font-medium capitalize">{s.status}</span>
        <span className="text-slate-500">· {secs}s</span>
        {s.mode === "agent" && s.steps > 0 && <span className="text-slate-500">· {s.steps} steps</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{s.note}</p>
      {s.status === "running" && s.streamingUrl && (
        <a href={s.streamingUrl} target="_blank" className="mt-2 inline-block text-xs text-sky-300 underline">
          Watch the agent live ↗
        </a>
      )}
    </div>
  );
}

const VERDICT: Record<VerifiedListing["verdict"], { label: string; cls: string }> = {
  green: { label: "Exact match", cls: "bg-teal-300/15 text-teal-300 border-teal-300/40" },
  amber: { label: "Needs a check", cls: "bg-amber-400/15 text-amber-300 border-amber-400/40" },
  red: { label: "Mismatch", cls: "bg-red-400/15 text-red-300 border-red-400/40" },
};

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));

function ResultsTable({ rows, qty }: { rows: VerifiedListing[]; qty: number }) {
  if (!rows.length) return <p className="p-4 text-slate-400">No seller listings were available. Check the seller errors and try again.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="bg-teal-950/40 text-xs uppercase tracking-wide text-teal-300">
          <tr>
            {["#", "Seller", "Stock", "MOQ", `₹ / unit @ ${qty}`, "Package", "Temp range", "Lifecycle", "Spec check", "Evidence"].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seller} className="border-t border-slate-700/50 align-top">
              <td className="px-3 py-3 text-slate-500">{r.rank}</td>
              <td className="px-3 py-3">
                <div className="font-medium text-slate-100">{r.seller}</div>
                <div className="text-xs text-slate-400">{r.seller_type.replace("_", " ")}</div>
                {r.source === "cached" && (
                  <span className="mt-1 inline-block rounded bg-amber-400/20 px-1.5 text-[10px] font-semibold uppercase text-amber-300">cached</span>
                )}
              </td>
              <td className="px-3 py-3 font-mono">{fmt(r.stock)}</td>
              <td className="px-3 py-3 font-mono">{fmt(r.moq)}</td>
              <td className="px-3 py-3 font-mono">
                {r.unit_price_inr !== null ? `₹${r.unit_price_inr.toFixed(2)}` : "—"}
                <PriceBreaks r={r} />
              </td>
              <td className="px-3 py-3">{r.package ?? <Unknown />}</td>
              <td className="px-3 py-3">{r.temp_range ?? <Unknown />}</td>
              <td className="px-3 py-3">{r.lifecycle ?? <Unknown />}</td>
              <td className="px-3 py-3">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${VERDICT[r.verdict].cls}`}>
                  {VERDICT[r.verdict].label}
                </span>
                <div className="mt-1 max-w-xs text-xs text-slate-300">{r.reason}</div>
              </td>
              <td className="px-3 py-3 text-xs">
                <a href={r.url} target="_blank" className="text-sky-300 underline">Source page ↗</a>
                <div className="mt-1 text-slate-500">read {new Date(r.read_at).toLocaleTimeString()}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceBreaks({ r }: { r: VerifiedListing }) {
  if (!r.price_breaks?.length) return null;
  return (
    <div className="mt-1 text-[11px] leading-4 text-slate-500">
      {r.price_breaks.slice(0, 6).map((p) => (
        <div key={p.qty}>
          {p.qty}+: {p.currency} {p.unit_price}
        </div>
      ))}
    </div>
  );
}

const Unknown = () => <span className="text-slate-500">unknown</span>;

function PendingRows({ job }: { job: SearchJob }) {
  return (
    <div className="divide-y divide-slate-700/50">
      {job.sellers.map((s) => (
        <div key={s.id} className="flex items-center gap-4 px-4 py-3 text-sm">
          <span className="w-32 font-medium text-slate-200">{s.name}</span>
          {s.listing ? (
            <span className="text-slate-300">
              stock {fmt(s.listing.stock)} · {s.listing.package ?? "package ?"} · {s.listing.temp_range ?? "temp ?"} · awaiting verification
            </span>
          ) : (
            <span className="text-slate-500">{s.note}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <p className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
      <span><b className="text-teal-300">●</b> Exact match</span>
      <span><b className="text-amber-300">●</b> Needs a check</span>
      <span><b className="text-red-300">●</b> Mismatch</span>
      <span>Ranking = spec match → stock vs need → price. Unknown fields are never guessed.</span>
    </p>
  );
}
