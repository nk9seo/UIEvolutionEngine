import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadProject } from "@/lib/pipeline/runner";
import { isProjectId } from "@/lib/storage/projects";
import { openInXcode } from "@/lib/xcode/build";

const Body = z.object({ version: z.number().int().min(1) });

/** Opens a generated version in Xcode on the machine running this local server. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/open">) {
  const { id } = await ctx.params;
  const project = isProjectId(id) ? await loadProject(id) : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => null));
  const version = body.success ? project.versions.find((v) => v.number === body.data.version) : undefined;
  if (!version?.files.length) return NextResponse.json({ error: "This version has no generated project" }, { status: 400 });
  try {
    await openInXcode(id, version.number);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open Xcode" }, { status: 500 });
  }
}
