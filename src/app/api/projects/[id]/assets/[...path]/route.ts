import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { isProjectId, projectDir, resolveInProject } from "@/lib/storage/projects";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".swift": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".pbxproj": "text/plain; charset=utf-8",
};

/** Serves project files (screenshots, sources, logs) with an extension allowlist and traversal checks. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/assets/[...path]">) {
  const { id, path: segments } = await ctx.params;
  if (!isProjectId(id)) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  const rel = segments.map(decodeURIComponent).join("/");
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!type || segments.some((s) => s === ".." || s.startsWith("."))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  let abs: string;
  try {
    abs = resolveInProject(id, rel);
    // Refuse symlinks that point outside the project directory.
    const [real, root] = await Promise.all([fs.realpath(abs), fs.realpath(projectDir(id))]);
    if (!real.startsWith(root + path.sep)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const data = await fs.readFile(abs);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": type, "Cache-Control": type.startsWith("image/") ? "private, max-age=3600" : "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
