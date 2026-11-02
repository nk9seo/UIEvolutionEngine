import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { LIMITS, MODELS } from "@/lib/config";
import { imageSize, toModelPng } from "@/lib/images";
import type { ResponseResult, StreamProgress } from "@/lib/meta/client";
import { generateImageAsset } from "@/lib/meta/image";
import { renderSegmentationOverlay, segmentInterface, UI_CONCEPTS } from "@/lib/meta/sam";
import type { DesignSpec, Platform } from "@/lib/schemas";
import { readProject, relativeToProject, resolveInProject, updateProject, versionDir } from "@/lib/storage/projects";
import type { BuildAttempt, ImageAsset, Job, JobStep, Project, StepKey, Version } from "@/lib/types";
import { bundleIdFor, readGeneratedSources, runXcodeBuild, writeXcodeProject } from "@/lib/xcode/build";
import { checkSourcePolicy } from "@/lib/xcode/policy";
import { previewOnMac, previewOnSimulator } from "@/lib/xcode/preview";
import { analyzeReference, critiqueRender, generateCode, improveCode, planDesign, repairCode } from "@/lib/pipeline/stages";

type SourceFiles = Array<{ path: string; contents: string }>;

const STEP_LABELS: Record<StepKey, string> = {
  prepare: "Prepare reference",
  segment: "Segment UI regions",
  analyze: "Visual understanding",
  spec: "Design specification",
  assets: "Generate image assets",
  codegen: "Generate SwiftUI",
  improve: "Apply improvements",
  build: "Compile with Xcode",
  preview: "Launch & capture",
  critique: "Visual comparison",
};

const STEP_MODELS: Partial<Record<StepKey, string>> = {
  segment: MODELS.sam,
  analyze: MODELS.spark,
  spec: MODELS.spark,
  assets: MODELS.image,
  codegen: MODELS.spark,
  improve: MODELS.spark,
  critique: MODELS.spark,
};

// Running jobs survive Next.js hot reloads via globalThis.
const g = globalThis as unknown as { __uieeJobs?: Map<string, AbortController> };
const running = (g.__uieeJobs ??= new Map());

export function isRunning(projectId: string) {
  return running.has(projectId);
}

export function cancelJob(projectId: string) {
  running.get(projectId)?.abort(new Error("Cancelled by user"));
}

/** Marks jobs that were running when the server stopped as interrupted. */
export async function loadProject(projectId: string): Promise<Project | null> {
  const p = await readProject(projectId);
  if (p?.job?.status === "running" && !running.has(projectId)) {
    return updateProject(projectId, (proj) => {
      if (!proj.job) return;
      proj.job.status = "failed";
      proj.job.error = "Interrupted: the server restarted while this job was running.";
      proj.job.endedAt = new Date().toISOString();
      for (const s of proj.job.steps) if (s.status === "running") s.status = "failed";
      const v = proj.versions.find((x) => x.number === proj.job!.versionNumber);
      if (v && v.status === "running") v.status = "failed";
    });
  }
  return p;
}

class JobContext {
  private lastFlush = 0;

  constructor(
    readonly projectId: string,
    readonly versionNumber: number,
    readonly signal: AbortSignal,
  ) {}

  update(mutate: (p: Project, v: Version, job: Job) => void) {
    return updateProject(this.projectId, (p) => {
      const v = p.versions.find((x) => x.number === this.versionNumber)!;
      mutate(p, v, p.job!);
    });
  }

  patchStep(key: StepKey, patch: Partial<JobStep>) {
    return this.update((_p, _v, job) => {
      const s = job.steps.find((x) => x.key === key);
      if (s) Object.assign(s, patch);
    });
  }

  /** Throttled live progress (reasoning summary + streamed size) for the UI. */
  progress(key: StepKey) {
    return (p: StreamProgress) => {
      const now = Date.now();
      if (now - this.lastFlush < 1200) return;
      this.lastFlush = now;
      void this.patchStep(key, {
        detail: p.outputChars ? `Streaming output… ${(p.outputChars / 1000).toFixed(1)}k chars` : "Reasoning…",
        live: p.reasoningSummary?.trim().slice(-700),
      }).catch(() => undefined);
    };
  }

  recordCall(stage: StepKey, r: ResponseResult) {
    return this.update((_p, v) => {
      v.modelCalls.push({
        stage,
        model: r.model,
        responseId: r.id,
        durationMs: r.durationMs,
        usage: r.usage,
        reasoningSummary: r.reasoningSummary,
      });
    });
  }

  async step<T>(key: StepKey, fn: () => Promise<T>, opts: { optional?: boolean } = {}): Promise<T | undefined> {
    if (this.signal.aborted) throw this.signal.reason;
    await this.patchStep(key, { status: "running", startedAt: new Date().toISOString(), detail: undefined, live: undefined });
    try {
      const value = await fn();
      await this.update((_p, _v, job) => {
        const s = job.steps.find((x) => x.key === key)!;
        s.status = s.status === "skipped" ? "skipped" : "done";
        s.endedAt = new Date().toISOString();
        s.live = undefined;
      });
      return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.patchStep(key, { status: "failed", endedAt: new Date().toISOString(), detail: message.slice(0, 800), live: undefined });
      if (opts.optional && !this.signal.aborted) return undefined;
      throw err;
    }
  }

  skip(key: StepKey, detail: string) {
    return this.patchStep(key, { status: "skipped", detail, endedAt: new Date().toISOString() });
  }
}

async function startJob(
  projectId: string,
  kind: Job["kind"],
  stepKeys: StepKey[],
  target: { make: (p: Project, number: number) => Version } | { existing: number },
  body: (ctx: JobContext, project: Project) => Promise<void>,
): Promise<number> {
  if (running.has(projectId)) throw new Error("A job is already running for this project.");
  const controller = new AbortController();
  running.set(projectId, controller);

  let versionNumber = 0;
  try {
    const project = await updateProject(projectId, (p) => {
      if ("existing" in target) {
        const v = p.versions.find((x) => x.number === target.existing);
        if (!v) throw new Error(`Version ${target.existing} not found`);
        versionNumber = v.number;
      } else {
        versionNumber = p.versions.length ? Math.max(...p.versions.map((v) => v.number)) + 1 : 1;
        p.versions.push(target.make(p, versionNumber));
      }
      p.job = {
        id: crypto.randomUUID(),
        kind,
        versionNumber,
        status: "running",
        startedAt: new Date().toISOString(),
        steps: stepKeys.map((key) => ({ key, label: STEP_LABELS[key], status: "pending", model: STEP_MODELS[key] })),
      };
    });
    await fs.mkdir(versionDir(projectId, versionNumber), { recursive: true });

    const ctx = new JobContext(projectId, versionNumber, controller.signal);
    void body(ctx, project)
      .then(() =>
        ctx.update((_p, v, job) => {
          job.status = v.status === "ready" ? "succeeded" : "failed";
          if (v.status === "build-failed") job.error = "The generated project did not compile after automatic repair attempts.";
          job.endedAt = new Date().toISOString();
        }),
      )
      .catch((err) =>
        ctx.update((_p, v, job) => {
          if (v.status === "running") v.status = "failed";
          job.status = "failed";
          job.error = err instanceof Error ? err.message : String(err);
          job.endedAt = new Date().toISOString();
          for (const s of job.steps) if (s.status === "pending") s.status = "skipped";
        }),
      )
      .catch(() => undefined)
      .finally(() => running.delete(projectId));
  } catch (err) {
    running.delete(projectId);
    throw err;
  }
  return versionNumber;
}

function blankVersion(number: number, parent: number | null, kind: Version["kind"], prompt: string): Version {
  return { number, parent, kind, createdAt: new Date().toISOString(), status: "running", prompt, files: [], modelCalls: [] };
}

// ---------------- Generate (v1 or a fresh regeneration) ----------------

export function startGenerate(projectId: string) {
  return startJob(
    projectId,
    "generate",
    ["segment", "analyze", "spec", "assets", "codegen", "build", "preview", "critique"],
    { make: (p, n) => blankVersion(n, null, "initial", p.prompt) },
    async (ctx, project) => {
      const modelPng = await fs.readFile(resolveInProject(project.id, project.reference.modelFile));
      const { width, height } = await imageSize(modelPng);
      const vdir = versionDir(project.id, ctx.versionNumber);

      // 1. SAM 3.1 — optional, non-blocking.
      let detections: Version["segmentation"] | undefined;
      if (project.useSegmentation) {
        detections = await ctx.step(
          "segment",
          async () => {
            const seg = await segmentInterface(modelPng, { signal: ctx.signal });
            const overlay = await renderSegmentationOverlay(modelPng, width, height, seg.objects, seg.shapes, UI_CONCEPTS);
            const overlayPath = path.join(vdir, "segmentation.png");
            await fs.writeFile(overlayPath, overlay);
            const segmentation = {
              model: MODELS.sam,
              concepts: [...UI_CONCEPTS],
              objects: seg.objects,
              imageWidth: width,
              imageHeight: height,
              overlay: relativeToProject(project.id, overlayPath),
              durationMs: seg.durationMs,
            };
            await ctx.update((_p, v) => {
              v.segmentation = segmentation;
            });
            await ctx.patchStep("segment", {
              detail: `${seg.objects.length} regions across ${UI_CONCEPTS.length} concepts${seg.failures.length ? ` (${seg.failures.length} concept requests failed)` : ""}`,
            });
            return segmentation;
          },
          { optional: true },
        );
      } else {
        await ctx.skip("segment", "Disabled for this project");
      }

      // 2. Muse Spark — visual understanding.
      const analysis = (await ctx.step("analyze", async () => {
        const { value, result } = await analyzeReference(
          { image: modelPng, width, height, prompt: project.prompt, platform: project.platform, constraints: project.constraints, detections: detections?.objects },
          { signal: ctx.signal, onProgress: ctx.progress("analyze") },
        );
        await ctx.recordCall("analyze", result);
        await ctx.update((_p, v) => {
          v.analysis = value;
        });
        await ctx.patchStep("analyze", { detail: `${value.regions.length} regions, ${value.elements.length} elements · ${value.layoutPattern}` });
        return value;
      }))!;

      // 3. Muse Spark — design specification + implementation plan.
      const specPlan = (await ctx.step("spec", async () => {
        const { value, result } = await planDesign(
          { image: modelPng, analysis, prompt: project.prompt, platform: project.platform, constraints: project.constraints, imageAssets: !!project.useImageAssets },
          { signal: ctx.signal, onProgress: ctx.progress("spec") },
        );
        await ctx.recordCall("spec", result);
        await ctx.update((_p, v) => {
          v.spec = value.spec;
          v.plan = value.plan;
          v.rationale = value.rationale;
        });
        await ctx.patchStep("spec", { detail: `${value.spec.layout} · ${value.spec.components.length} components · ${value.plan.files.length} files planned` });
        return value;
      }))!;

      // 4. Muse Image — optional decorative assets proposed by the spec.
      let assets: ImageAsset[] = [];
      if (project.useImageAssets && specPlan.spec.imageAssets.length) {
        assets =
          (await ctx.step(
            "assets",
            async () => {
              const dir = path.join(vdir, "assets");
              await fs.mkdir(dir, { recursive: true });
              const wanted = specPlan.spec.imageAssets;
              const settled = await Promise.allSettled(wanted.map((a) => generateImageAsset(a.prompt, a.aspect, ctx.signal)));
              const out: ImageAsset[] = [];
              const failures: string[] = [];
              for (let i = 0; i < wanted.length; i++) {
                const r = settled[i];
                if (r.status === "rejected") {
                  failures.push(`${wanted[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
                  continue;
                }
                const file = path.join(dir, `${wanted[i].name}.png`);
                await fs.writeFile(file, r.value.png);
                out.push({
                  ...wanted[i],
                  file: relativeToProject(project.id, file),
                  width: r.value.width,
                  height: r.value.height,
                  model: MODELS.image,
                  durationMs: r.value.durationMs,
                });
              }
              if (!out.length) throw new Error(`Muse Image failed: ${failures.join("; ")}`);
              await ctx.update((_p, v) => {
                v.assets = out;
              });
              await ctx.patchStep("assets", { detail: `${out.map((a) => a.name).join(", ")}${failures.length ? ` · ${failures.length} failed` : ""}` });
              return out;
            },
            { optional: true },
          )) ?? [];
      } else {
        await ctx.skip("assets", project.useImageAssets ? "The design specification requested no imagery" : "Disabled for this project");
      }

      // 5. Muse Spark — SwiftUI source.
      const files = (await ctx.step("codegen", async () => {
        const { value, result } = await generateCode(
          { image: modelPng, spec: specPlan.spec, plan: specPlan.plan, analysis, prompt: project.prompt, platform: project.platform, assets },
          { signal: ctx.signal, onProgress: ctx.progress("codegen") },
        );
        await ctx.recordCall("codegen", result);
        await ctx.update((_p, v) => {
          v.codegenNotes = value.notes;
        });
        const lines = value.files.reduce((n, f) => n + f.contents.split("\n").length, 0);
        await ctx.patchStep("codegen", { detail: `${value.files.length} Swift files · ${lines} lines` });
        return value.files;
      }))!;

      await buildPreviewCritique(ctx, project, specPlan.spec, files, modelPng, assets);
    },
  );
}

// ---------------- Improve (new version from a parent) ----------------

export function startImprove(projectId: string, opts: { parent: number; instruction: string; issueIds: string[] }) {
  return startJob(
    projectId,
    "improve",
    ["improve", "build", "preview", "critique"],
    { make: (p, n) => {
      const parent = p.versions.find((v) => v.number === opts.parent);
      if (!parent) throw new Error(`Version ${opts.parent} not found`);
      if (!parent.spec || !parent.files.length) throw new Error(`Version ${opts.parent} has no generated sources to improve`);
      return {
        ...blankVersion(n, parent.number, "improvement", p.prompt),
        instruction: opts.instruction.slice(0, LIMITS.maxPromptChars),
        selectedIssues: opts.issueIds,
        analysis: parent.analysis,
        segmentation: parent.segmentation,
        spec: parent.spec,
        plan: parent.plan,
        rationale: parent.rationale,
        assets: parent.assets,
      };
    } },
    async (ctx, project) => {
      const parent = project.versions.find((v) => v.number === opts.parent)!;
      const spec = parent.spec!;
      const reference = await fs.readFile(resolveInProject(project.id, project.reference.modelFile));
      const rendered = parent.preview?.status === "captured" && parent.preview.image
        ? await toModelPng(await fs.readFile(resolveInProject(project.id, parent.preview.image)))
        : null;
      const parentFiles = await readGeneratedSources(project.id, parent.number);
      const issues = (parent.critique?.issues ?? []).filter((i) => opts.issueIds.includes(i.id));

      const files = (await ctx.step("improve", async () => {
        const { value, result } = await improveCode(
          { reference, rendered, spec, issues, instruction: opts.instruction, files: parentFiles, platform: project.platform, assets: parent.assets ?? [] },
          { signal: ctx.signal, onProgress: ctx.progress("improve") },
        );
        await ctx.recordCall("improve", result);
        await ctx.update((_p, v) => {
          v.codegenNotes = value.notes;
        });
        const changed = value.files.filter((f) => parentFiles.find((p) => p.path === f.path)?.contents !== f.contents).length;
        await ctx.patchStep("improve", { detail: `${value.files.length} files · ${changed} changed vs v${parent.number}` });
        return value.files;
      }))!;

      await buildPreviewCritique(ctx, project, spec, files, reference, parent.assets ?? []);
    },
  );
}

// ---------------- Shared: compile (with repair), preview, critique ----------------

function summarizeBuildOutput(chunk: string): string | null {
  const lines = chunk.split("\n").reverse();
  for (const l of lines) {
    const m = l.match(/^(SwiftCompile|CompileSwift|SwiftDriver|Ld|CodeSign|ProcessInfoPlistFile|RegisterExecutionPolicyException|Validate|CopySwiftLibs|SwiftEmitModule)\b.*?([\w+-]+\.(?:swift|app))?\s*(?:\(in target|$)/);
    if (m) return `${m[1]}${m[2] ? ` ${m[2]}` : ""}`;
  }
  return null;
}

async function buildPreviewCritique(
  ctx: JobContext,
  project: Project,
  spec: DesignSpec,
  initialFiles: SourceFiles,
  referencePng: Buffer,
  assets: ImageAsset[],
) {
  const assetFiles = assets.map((a) => ({ name: a.name, file: resolveInProject(project.id, a.file) }));
  const platform: Platform = project.platform;
  const attempts: BuildAttempt[] = [];
  let files = initialFiles;
  let appPath: string | null = null;
  const started = Date.now();

  await ctx.step("build", async () => {
    for (let attempt = 1; attempt <= 1 + LIMITS.buildRepairAttempts; attempt++) {
      await ctx.patchStep("build", { detail: attempt === 1 ? "Writing isolated Xcode project…" : `Attempt ${attempt}: rebuilding repaired sources…` });
      await writeXcodeProject({ projectId: project.id, version: ctx.versionNumber, platform, appName: spec.appName, window: spec.window, files, assets: assetFiles });
      await ctx.update((_p, v) => {
        v.files = files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.contents) }));
      });

      // Policy gate: violating code is written for inspection but never compiled or launched.
      const violations = checkSourcePolicy(files, platform);
      let rec: BuildAttempt;
      if (violations.length) {
        const logFile = `versions/v${ctx.versionNumber}/build-${attempt}.log`;
        await fs.writeFile(resolveInProject(project.id, logFile), `Source policy rejected the generated code; xcodebuild was not run.\n\n${violations.map((d) => `${d.file}:${d.line}:${d.column}: error: ${d.message}`).join("\n")}\n`);
        rec = { attempt, status: "rejected", durationMs: 0, diagnostics: violations, logFile };
      } else {
        let lastFlush = 0;
        const r = await runXcodeBuild({
          projectId: project.id,
          version: ctx.versionNumber,
          platform,
          attempt,
          signal: ctx.signal,
          onOutput: (chunk) => {
            const s = summarizeBuildOutput(chunk);
            if (!s || Date.now() - lastFlush < 800) return;
            lastFlush = Date.now();
            void ctx.patchStep("build", { detail: `Attempt ${attempt}: ${s}` }).catch(() => undefined);
          },
        });
        rec = { attempt, status: r.succeeded ? "succeeded" : "failed", durationMs: r.durationMs, diagnostics: r.diagnostics, logFile: r.logFile };
        appPath = r.appPath;
      }
      attempts.push(rec);
      await ctx.update((_p, v) => {
        v.build = { status: rec.status === "succeeded" ? "succeeded" : "failed", attempts: [...attempts], sdk: platform === "iOS" ? "iphonesimulator" : "macosx", durationMs: Date.now() - started };
      });
      if (rec.status === "succeeded") {
        await ctx.patchStep("build", { detail: `BUILD SUCCEEDED${attempt > 1 ? ` after ${attempt - 1} AI repair${attempt > 2 ? "s" : ""}` : ""} · ${(rec.durationMs / 1000).toFixed(1)}s` });
        return;
      }
      if (attempt > LIMITS.buildRepairAttempts) break;

      const errorCount = rec.diagnostics.filter((d) => d.severity === "error").length;
      await ctx.patchStep("build", { detail: `${errorCount} error${errorCount === 1 ? "" : "s"} — Muse Spark is repairing (attempt ${attempt + 1})…`, model: MODELS.spark });
      const { value, result } = await repairCode(
        { files, diagnostics: rec.diagnostics, spec, platform },
        { signal: ctx.signal, onProgress: ctx.progress("build") },
      );
      await ctx.recordCall("build", result);
      const byPath = new Map(files.map((f) => [f.path, f]));
      for (const f of value.files) byPath.set(f.path, f);
      files = [...byPath.values()];
      attempts[attempts.length - 1].repair = value.diagnosis;
    }
    await ctx.update((_p, v) => {
      v.status = "build-failed";
    });
    throw new Error(`Build failed after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`);
  }, { optional: true });

  if (!appPath) {
    await ctx.skip("preview", "No successful build to launch");
    await ctx.skip("critique", "No rendered screenshot to compare");
    await ctx.update((_p, v) => {
      v.status = "build-failed";
    });
    return;
  }
  await previewAndCritique(ctx, project, spec, appPath, referencePng);
}

/** Launches a built app (simulator or Mac), captures it, and asks Muse Spark to compare it with the reference. */
async function previewAndCritique(ctx: JobContext, project: Project, spec: DesignSpec, appPath: string, referencePng: Buffer) {
  const platform: Platform = project.platform;
  // Preview on a real simulator (iOS) or as a real macOS app.
  const outFile = path.join(versionDir(project.id, ctx.versionNumber), "preview.png");
  const preview = (await ctx.step("preview", async () => {
    const onStatus = (s: string) => void ctx.patchStep("preview", { detail: s }).catch(() => undefined);
    const p =
      platform === "iOS"
        ? await previewOnSimulator({ appPath: appPath!, bundleId: bundleIdFor(project.id), outFile, appearance: spec.appearance, onStatus })
        : await previewOnMac({ appPath: appPath!, outFile, onStatus });
    const stored = { ...p, image: p.image ? relativeToProject(project.id, p.image) : undefined };
    await ctx.update((_p, v) => {
      v.preview = stored;
      v.status = "ready";
    });
    if (p.status !== "captured") throw new Error(p.note ?? "Preview unavailable");
    await ctx.patchStep("preview", { detail: `${p.target} · ${p.method}` });
    return p;
  }, { optional: true }))!;

  await ctx.update((_p, v) => {
    v.status = "ready";
  });

  if (!preview || preview.status !== "captured" || !preview.image) {
    await ctx.skip("critique", "No rendered screenshot to compare");
    return;
  }

  await ctx.step("critique", async () => {
    const rendered = await toModelPng(await fs.readFile(preview.image!));
    const { value, result } = await critiqueRender(
      { reference: referencePng, rendered, spec, prompt: project.prompt, platform, target: preview.target ?? platform },
      { signal: ctx.signal, onProgress: ctx.progress("critique") },
    );
    await ctx.recordCall("critique", result);
    value.issues.sort((a, b) => a.priority - b.priority);
    await ctx.update((_p, v) => {
      v.critique = value;
    });
    await ctx.patchStep("critique", { detail: `Score ${Math.round(value.overallScore)}/100 · ${value.issues.length} issues` });
  }, { optional: true });
}

// ---------------- Retry preview for an existing build ----------------

export async function startRecapture(projectId: string, versionNumber: number) {
  const project = await readProject(projectId);
  const v = project?.versions.find((x) => x.number === versionNumber);
  if (!project || !v) throw new Error(`Version ${versionNumber} not found`);
  if (v.build?.status !== "succeeded" || !v.spec) throw new Error(`Version ${versionNumber} has no successful build`);
  const appPath = path.join(versionDir(projectId, versionNumber), "app", "GeneratedApp.app");
  await fs.access(appPath);
  return startJob(projectId, "preview", ["preview", "critique"], { existing: versionNumber }, async (ctx, p) => {
    const reference = await fs.readFile(resolveInProject(p.id, p.reference.modelFile));
    await previewAndCritique(ctx, p, v.spec!, appPath, reference);
  });
}

export async function projectExists(projectId: string) {
  return (await readProject(projectId)) !== null;
}
