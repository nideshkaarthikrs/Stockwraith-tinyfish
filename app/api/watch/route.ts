import { addWatch, listWatches } from "@/lib/watch";

export async function GET() {
  return Response.json(await listWatches());
}

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { mpn, seller, url } = body ?? {};
  if (![mpn, seller, url].every((v) => typeof v === "string" && v.trim() && v.length <= 2048))
    return Response.json({ error: "mpn, seller and URL required" }, { status: 400 });
  let target;
  try { target = new URL(url); } catch {
    return Response.json({ error: "invalid URL" }, { status: 400 });
  }
  if (target.protocol !== "https:" || target.username || target.password ||
      target.hostname !== "estore.st.com")
    return Response.json({ error: "only ST eStore HTTPS URLs are supported" }, { status: 400 });
  try {
    return Response.json(await addWatch(mpn, seller, url));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
