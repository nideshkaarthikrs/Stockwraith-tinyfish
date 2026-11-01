import { addWatch, listWatches } from "@/lib/watch";

export async function GET() {
  return Response.json(await listWatches());
}

export async function POST(req: Request) {
  const { mpn, seller, url } = await req.json();
  try {
    return Response.json(await addWatch(mpn, seller, url));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
