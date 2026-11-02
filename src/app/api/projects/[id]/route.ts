import { NextResponse, type NextRequest } from "next/server";
import { loadProject } from "@/lib/pipeline/runner";
import { isProjectId } from "@/lib/storage/projects";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!isProjectId(id)) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  const project = await loadProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ project }, { headers: { "Cache-Control": "no-store" } });
}
