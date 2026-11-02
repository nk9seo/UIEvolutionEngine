import { NextResponse, type NextRequest } from "next/server";
import { isRunning, loadProject, startGenerate } from "@/lib/pipeline/runner";
import { isProjectId } from "@/lib/storage/projects";

/** Runs the full pipeline again as a new version (previous versions are kept). */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/generate">) {
  const { id } = await ctx.params;
  if (!isProjectId(id) || !(await loadProject(id))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (isRunning(id)) return NextResponse.json({ error: "A job is already running for this project" }, { status: 409 });
  const version = await startGenerate(id);
  return NextResponse.json({ version }, { status: 202 });
}
