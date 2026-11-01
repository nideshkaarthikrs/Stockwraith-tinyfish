import { getJob } from "@/lib/search";
import { readJson, searchPath } from "@/lib/store";
import type { SearchJob } from "@/lib/search";

export async function GET(_req: Request, ctx: RouteContext<"/api/search/[id]">) {
  const { id } = await ctx.params;
  const job = getJob(id) ?? (await readJson<SearchJob>(searchPath(id)));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(job);
}
