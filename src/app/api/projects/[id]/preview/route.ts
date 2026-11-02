import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isRunning, loadProject, startRecapture } from "@/lib/pipeline/runner";
import { isProjectId } from "@/lib/storage/projects";

const Body = z.object({ version: z.number().int().min(1) });

/** Relaunches an already-built version and captures it again (no code is regenerated). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/preview">) {
  const { id } = await ctx.params;
  if (!isProjectId(id) || !(await loadProject(id))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  if (isRunning(id)) return NextResponse.json({ error: "A job is already running for this project" }, { status: 409 });
  try {
    await startRecapture(id, body.data.version);
    return NextResponse.json({ version: body.data.version }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start" }, { status: 400 });
  }
}
