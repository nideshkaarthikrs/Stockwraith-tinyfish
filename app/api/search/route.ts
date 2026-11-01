import { startSearch, startReplay, anyRunning } from "@/lib/search";
import { tempPair } from "@/lib/verify";
import type { SpecInput } from "@/lib/schema";

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "request must be an object" }, { status: 400 });
  const spec: SpecInput = {
    mpn: String(body.mpn ?? "").trim().toUpperCase(),
    package: String(body.package ?? "").trim(),
    temp_range: String(body.temp_range ?? "").trim(),
    qty: Number(body.qty),
  };
  if (typeof body.mpn !== "string" || !/^[A-Z0-9][A-Z0-9._+/-]{0,99}$/.test(spec.mpn)) return Response.json({ error: "valid part number required" }, { status: 400 });

  if (typeof body.qty !== "number" || !Number.isSafeInteger(spec.qty) || spec.qty < 1)
    return Response.json({ error: "quantity must be a positive whole number" }, { status: 400 });
  if (typeof body.package !== "string" || !spec.package || spec.package.length > 100 ||
      typeof body.temp_range !== "string" || !spec.temp_range || spec.temp_range.length > 100)
    return Response.json({ error: "package and temperature range required" }, { status: 400 });
  const range = tempPair(spec.temp_range);
  if (!range)
    return Response.json({ error: "temperature range must be two values in °C, e.g. -40 to +85 °C" }, { status: 400 });
  if (range[0] > range[1])
    return Response.json({ error: "valid minimum and maximum temperature required" }, { status: 400 });
  if (body.replay !== undefined && typeof body.replay !== "boolean")
    return Response.json({ error: "replay must be a boolean" }, { status: 400 });

  if (body.replay) {
    const job = await startReplay(spec);
    if (!job) return Response.json({ error: "no recorded run for this part yet" }, { status: 404 });
    return Response.json({ id: job.id });
  }
  // The account allows 2 concurrent agent runs; one live search at a time.
  if (anyRunning()) return Response.json({ error: "a live search is already running" }, { status: 409 });
  return Response.json({ id: startSearch(spec).id });
}
