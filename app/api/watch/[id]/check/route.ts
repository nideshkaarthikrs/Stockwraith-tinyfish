import { checkWatch, clearAlert } from "@/lib/watch";

export async function POST(req: Request, ctx: RouteContext<"/api/watch/[id]/check">) {
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode");
  try {
    if (mode === "clear") {
      await clearAlert(id);
      return Response.json({ ok: true });
    }
    const w = await checkWatch(id, mode === "simulate");
    if (!w) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(w);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
