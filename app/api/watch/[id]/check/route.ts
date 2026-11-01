import { checkWatch, clearAlert } from "@/lib/watch";

export async function POST(req: Request, ctx: RouteContext<"/api/watch/[id]/check">) {
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode && !["clear", "simulate"].includes(mode))
    return Response.json({ error: "invalid mode" }, { status: 400 });
  try {
    if (mode === "clear") {
      if (!await clearAlert(id)) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ ok: true });
    }
    const w = await checkWatch(id, mode === "simulate");
    if (!w) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(w);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
