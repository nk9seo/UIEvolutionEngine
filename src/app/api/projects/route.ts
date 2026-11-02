import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LIMITS } from "@/lib/config";
import { normalizeReference, UploadError } from "@/lib/images";
import { startGenerate } from "@/lib/pipeline/runner";
import { Platform } from "@/lib/schemas";
import { createProject, listProjects, newProjectId, writeProjectFile } from "@/lib/storage/projects";
import type { Project } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

const Fields = z.object({
  prompt: z.string().trim().min(3, "Describe the transformation").max(LIMITS.maxPromptChars),
  platform: Platform,
  constraints: z.string().trim().max(LIMITS.maxPromptChars).default(""),
  name: z.string().trim().max(60).default(""),
  useSegmentation: z.enum(["true", "false"]).default("true"),
  useImageAssets: z.enum(["true", "false"]).default("false"),
});

/** Creates a project from an uploaded screenshot and starts the first generation. */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a screenshot (PNG, JPEG or WebP)" }, { status: 400 });
  if (file.size > LIMITS.maxUploadBytes) {
    return NextResponse.json({ error: `The image is larger than ${LIMITS.maxUploadBytes / 1024 / 1024} MB` }, { status: 413 });
  }
  const fields = Fields.safeParse({
    prompt: form.get("prompt") ?? "",
    platform: form.get("platform") ?? "",
    constraints: form.get("constraints") ?? undefined,
    name: form.get("name") ?? undefined,
    useSegmentation: form.get("useSegmentation") ?? undefined,
    useImageAssets: form.get("useImageAssets") ?? undefined,
  });
  if (!fields.success) {
    return NextResponse.json({ error: fields.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  let image: Awaited<ReturnType<typeof normalizeReference>>;
  try {
    image = await normalizeReference(Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    const status = err instanceof UploadError ? 400 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid image" }, { status });
  }

  const id = newProjectId();
  const now = new Date().toISOString();
  const originalName = file.name.replace(/[^\w .()-]/g, "_").slice(0, 80) || "reference";
  const project: Project = {
    id,
    name: fields.data.name || originalName.replace(/\.[a-z0-9]+$/i, ""),
    createdAt: now,
    updatedAt: now,
    platform: fields.data.platform,
    prompt: fields.data.prompt,
    constraints: fields.data.constraints,
    useSegmentation: fields.data.useSegmentation === "true",
    useImageAssets: fields.data.useImageAssets === "true",
    reference: {
      file: "reference.png",
      modelFile: "reference-model.png",
      width: image.width,
      height: image.height,
      originalName,
      bytes: file.size,
    },
    versions: [],
  };
  await createProject(project);
  await writeProjectFile(id, "reference.png", image.png);
  await writeProjectFile(id, "reference-model.png", image.modelPng);
  await startGenerate(id);
  return NextResponse.json({ id }, { status: 201 });
}
