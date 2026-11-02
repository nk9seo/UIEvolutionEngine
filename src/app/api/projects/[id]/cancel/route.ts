import { NextResponse, type NextRequest } from "next/server";
import { cancelJob, isRunning } from "@/lib/pipeline/runner";
import { isProjectId } from "@/lib/storage/projects";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/cancel">) {
  const { id } = await ctx.params;
  if (!isProjectId(id)) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  if (!isRunning(id)) return NextResponse.json({ error: "No running job" }, { status: 409 });
  cancelJob(id);
  return NextResponse.json({ ok: true });
}
