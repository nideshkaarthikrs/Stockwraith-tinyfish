import { startSearch, startReplay, anyRunning } from "@/lib/search";
import type { SpecInput } from "@/lib/schema";

export async function POST(req: Request) {
  const body = (await req.json()) as SpecInput & { replay?: boolean };
  const spec: SpecInput = {
    mpn: String(body.mpn ?? "").trim().toUpperCase(),
    package: String(body.package ?? "").trim(),
    temp_range: String(body.temp_range ?? "").trim(),
    qty: Number(body.qty) || 1,
  };
  if (!spec.mpn) return Response.json({ error: "part number required" }, { status: 400 });

  if (body.replay) {
    const job = await startReplay(spec);
    if (!job) return Response.json({ error: "no recorded run for this part yet" }, { status: 404 });
    return Response.json({ id: job.id });
  }
  // The account allows 2 concurrent agent runs; one live search at a time.
  if (anyRunning()) return Response.json({ error: "a live search is already running" }, { status: 409 });
  return Response.json({ id: startSearch(spec).id });
}
