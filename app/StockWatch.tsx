"use client";

import { useEffect, useState } from "react";
import type { Watch } from "@/lib/watch";

const TARGET = { mpn: "STM32F103C8T6", seller: "ST eStore", url: "https://estore.st.com/en/stm32f103c8t6-cpn.html" };

export default function StockWatch() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch("/api/watch", { cache: "no-store" });
    if (!r.ok) throw new Error("Could not load watches");
    setWatches(await r.json());
  };
  useEffect(() => {
    let active = true;
    fetch("/api/watch", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("Could not load watches"); return r.json(); })
      .then((ws) => { if (active) setWatches(ws); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  async function act(label: string, fn: () => Promise<Response>) {
    setBusy(label);
    setError(null);
    try {
    const res = await fn();
    if (!res.ok) setError((await res.json()).error ?? "failed");
    await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Watch request failed");
    } finally { setBusy(null); }
  }

  const create = () =>
    act("create", () => fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(TARGET) }));
  const check = (id: string, mode?: string) =>
    act(mode ?? "check", () => fetch(`/api/watch/${id}/check${mode ? `?mode=${mode}` : ""}`, { method: "POST" }));

  const alerts = watches.filter((w) => w.alert);

  return (
    <section className="mt-10">
      {alerts.map((w) => (
        <div key={w.id} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-300/10 p-4 shadow-[0_0_30px_rgba(94,234,212,0.25)]">
          <div>
            <div className="text-lg font-bold text-teal-200">🔔 Back in stock: {w.mpn} at {w.seller}</div>
            <div className="text-sm text-slate-300">
              {w.alert!.evidence} · {new Date(w.alert!.at).toLocaleTimeString()} ·{" "}
              <a href={w.url} target="_blank" className="text-sky-300 underline">open page ↗</a>
            </div>
          </div>
          <button onClick={() => check(w.id, "clear")} className="text-xs text-slate-400 underline">dismiss</button>
        </div>
      ))}

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-100">Stock Watch</h2>
            <p className="text-xs text-slate-400">A TinyFish monitor re-reads a sold-out page and alerts when stock returns.</p>
          </div>
          {!watches.some((w) => w.url === TARGET.url) && (
            <button onClick={create} disabled={!!busy} className="rounded-lg border border-teal-300 px-3 py-1.5 text-sm text-teal-300 hover:bg-teal-300/10 disabled:opacity-50">
              {busy === "create" ? "Creating monitor…" : `Watch ${TARGET.mpn} at ${TARGET.seller}`}
            </button>
          )}
        </div>
        {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
        {watches.length === 0 && <p className="text-sm text-slate-500">No watches yet.</p>}
        {watches.map((w) => {
          const last = w.checks.at(-1);
          return (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/50 py-3 text-sm">
              <div>
                <div className="font-medium text-slate-200">
                  {w.mpn} · {w.seller}{" "}
                  <span className="font-mono text-[11px] text-slate-500">monitor {w.id.slice(0, 8)}</span>
                </div>
                <div className={last?.inStock ? "text-teal-300" : last?.inStock === false ? "text-amber-300" : "text-slate-400"}>
                  {last ? `${last.inStock ? "In stock" : last.inStock === false ? "Still out of stock" : "Unclear"} · ${last.evidence} · checked ${new Date(last.at).toLocaleTimeString()}` : "not checked yet"}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => check(w.id)} disabled={!!busy} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                  {busy === "check" ? "Checking live…" : "Check now"}
                </button>
                <button onClick={() => check(w.id, "simulate")} disabled={!!busy} className="rounded-lg border border-dashed border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50">
                  Simulate restock (demo)
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
