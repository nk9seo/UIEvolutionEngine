import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LIMITS } from "@/lib/config";
import { isRunning, loadProject, startImprove } from "@/lib/pipeline/runner";
import { isProjectId } from "@/lib/storage/projects";

const Body = z.object({
  parent: z.number().int().min(1),
  instruction: z.string().trim().max(LIMITS.maxPromptChars).default(""),
  issueIds: z.array(z.string().max(40)).max(20).default([]),
});

/** Creates a new version by improving an existing one (never overwrites the parent). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/improve">) {
  const { id } = await ctx.params;
  if (!isProjectId(id) || !(await loadProject(id))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  if (!body.data.instruction && body.data.issueIds.length === 0) {
    return NextResponse.json({ error: "Select at least one issue or describe the improvement" }, { status: 400 });
  }
  if (isRunning(id)) return NextResponse.json({ error: "A job is already running for this project" }, { status: 409 });
  try {
    const version = await startImprove(id, body.data);
    return NextResponse.json({ version }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start" }, { status: 400 });
  }
}
