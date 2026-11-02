import "server-only";
import { MODELS } from "@/lib/config";
import { createStructuredResponse, imageDataUrl, type InputContent, type ReasoningEffort, type ResponseResult, type StreamProgress } from "@/lib/meta/client";
import {
  CodegenResult, Critique, RepairResult, SpecAndPlan, UIAnalysis, toModelSchema,
  type DesignSpec, type ImplementationPlan, type Platform,
} from "@/lib/schemas";
import type { BuildDiagnostic, SegmentationObject } from "@/lib/types";
import {
  ANALYZE_INSTRUCTIONS, CRITIQUE_INSTRUCTIONS, assetsNote, codegenInstructions, improveInstructions, repairInstructions, specInstructions,
} from "@/lib/pipeline/prompts";

/** Each Muse Spark stage: typed input -> schema-constrained, Zod-validated output. */

type StageOpts = { signal?: AbortSignal; onProgress?: (p: StreamProgress) => void };
type StageResult<T> = { value: T; result: ResponseResult };

const EFFORT: Record<"analyze" | "spec" | "codegen" | "repair" | "critique" | "improve", ReasoningEffort> = {
  analyze: "medium",
  spec: "medium",
  codegen: "medium",
  repair: "medium",
  critique: "medium",
  improve: "medium",
};

const SCHEMAS = {
  analysis: toModelSchema(UIAnalysis),
  specAndPlan: toModelSchema(SpecAndPlan),
  codegen: toModelSchema(CodegenResult),
  repair: toModelSchema(RepairResult),
  critique: toModelSchema(Critique),
};

function userMessage(content: InputContent[]) {
  return [{ type: "message" as const, role: "user" as const, content }];
}

function filesBlock(files: Array<{ path: string; contents: string }>) {
  return files.map((f) => `=== FILE: ${f.path} ===\n${f.contents}`).join("\n\n");
}

export async function analyzeReference(
  input: {
    image: Buffer;
    width: number;
    height: number;
    prompt: string;
    platform: Platform;
    constraints: string;
    detections?: SegmentationObject[];
  },
  opts: StageOpts,
): Promise<StageResult<UIAnalysis>> {
  const detections = input.detections?.length
    ? `\n\nSAM 3.1 detections (source pixels on this ${input.width}×${input.height} image; convert to the 0-1000 grid as x*1000/${input.width}, y*1000/${input.height}):\n` +
      input.detections
        .map((d) => `- ${d.concept}#${d.objectId}: [${d.box.left}, ${d.box.top}, ${d.box.right}, ${d.box.bottom}]${d.confidence !== null ? ` conf ${d.confidence.toFixed(2)}` : ""}`)
        .join("\n")
    : "";
  return createStructuredResponse(
    {
      model: MODELS.spark,
      instructions: ANALYZE_INSTRUCTIONS,
      reasoning: { effort: EFFORT.analyze, summary: "auto" },
      schemaName: "ui_analysis",
      schema: SCHEMAS.analysis,
      input: userMessage([
        {
          type: "input_text",
          text: `Reference screenshot: ${input.width}×${input.height} px.\nTarget platform for the transformation: ${input.platform}.\nTransformation request (for context only — describe the reference as it is): ${input.prompt}${input.constraints ? `\nDesign constraints: ${input.constraints}` : ""}${detections}`,
        },
        { type: "input_image", image_url: imageDataUrl(input.image) },
      ]),
    },
    (v) => UIAnalysis.parse(v),
    opts,
  );
}

export async function planDesign(
  input: { image: Buffer; analysis: UIAnalysis; prompt: string; platform: Platform; constraints: string; imageAssets: boolean },
  opts: StageOpts,
): Promise<StageResult<SpecAndPlan>> {
  return createStructuredResponse(
    {
      model: MODELS.spark,
      instructions: specInstructions(input.platform, input.imageAssets),
      reasoning: { effort: EFFORT.spec, summary: "auto" },
      schemaName: "design_spec_and_plan",
      schema: SCHEMAS.specAndPlan,
      input: userMessage([
        {
          type: "input_text",
          text: `Target platform: ${input.platform}\nTransformation request: ${input.prompt}${input.constraints ? `\nDesign constraints: ${input.constraints}` : ""}\n\nStructured analysis of the reference screenshot (attached):\n${JSON.stringify(input.analysis)}`,
        },
        { type: "input_image", image_url: imageDataUrl(input.image) },
      ]),
    },
    (v) => {
      const parsed = SpecAndPlan.parse(v);
      parsed.spec.platform = input.platform;
      if (!input.imageAssets) parsed.spec.imageAssets = [];
      if (!parsed.plan.files.some((f) => f.path === "RootView.swift")) {
        parsed.plan.files.unshift({ path: "RootView.swift", purpose: "Root view hosted by the app harness", views: ["RootView"] });
      }
      return parsed;
    },
    opts,
  );
}

export async function generateCode(
  input: {
    image: Buffer;
    spec: DesignSpec;
    plan: ImplementationPlan;
    analysis: UIAnalysis;
    prompt: string;
    platform: Platform;
    assets: Array<{ name: string; usage: string; aspect: string }>;
  },
  opts: StageOpts,
): Promise<StageResult<CodegenResult>> {
  return createStructuredResponse(
    {
      model: MODELS.spark,
      instructions: codegenInstructions(input.platform),
      reasoning: { effort: EFFORT.codegen, summary: "auto" },
      schemaName: "swiftui_project",
      schema: SCHEMAS.codegen,
      input: userMessage([
        {
          type: "input_text",
          text: `Transformation request: ${input.prompt}\n\nDesign specification:\n${JSON.stringify(input.spec)}\n\nImplementation plan:\n${JSON.stringify(input.plan)}\n\nReference analysis (content and texts to reuse):\n${JSON.stringify({ regions: input.analysis.regions, elements: input.analysis.elements.map((e) => ({ type: e.type, label: e.label, regionId: e.regionId })) })}\n\n${assetsNote(input.assets)}\n\nThe reference screenshot is attached for visual context.`,
        },
        { type: "input_image", image_url: imageDataUrl(input.image) },
      ]),
    },
    (v) => CodegenResult.parse(v),
    opts,
  );
}

export async function repairCode(
  input: { files: Array<{ path: string; contents: string }>; diagnostics: BuildDiagnostic[]; spec: DesignSpec; platform: Platform },
  opts: StageOpts,
): Promise<StageResult<RepairResult>> {
  const errors = input.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.file || "(project)"}${d.line ? `:${d.line}:${d.column}` : ""}: error: ${d.message}`)
    .join("\n");
  return createStructuredResponse(
    {
      model: MODELS.spark,
      instructions: repairInstructions(input.platform),
      reasoning: { effort: EFFORT.repair, summary: "auto" },
      schemaName: "swiftui_repair",
      schema: SCHEMAS.repair,
      input: userMessage([
        {
          type: "input_text",
          text: `Diagnostics:\n${errors}\n\nDesign specification (for intent):\n${JSON.stringify({ appName: input.spec.appName, layout: input.spec.layout, appearance: input.spec.appearance })}\n\nCurrent sources:\n${filesBlock(input.files)}`,
        },
      ]),
    },
    (v) => RepairResult.parse(v),
    opts,
  );
}

export async function critiqueRender(
  input: { reference: Buffer; rendered: Buffer; spec: DesignSpec; prompt: string; instructions: string[]; platform: Platform; target: string },
  opts: StageOpts,
): Promise<StageResult<Critique>> {
  const later = input.instructions.length
    ? `\nLater instructions from the developer, oldest first (requirements; they override the request and the specification):\n${input.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";
  return createStructuredResponse(
    {
      model: MODELS.spark,
      instructions: CRITIQUE_INSTRUCTIONS,
      reasoning: { effort: EFFORT.critique, summary: "auto" },
      schemaName: "visual_critique",
      schema: SCHEMAS.critique,
      input: userMessage([
        {
          type: "input_text",
          text: `User's transformation request: ${input.prompt}${later}\nTarget: ${input.platform} (${input.target}).\nDesign specification:\n${JSON.stringify(input.spec)}\n\nImage 1: original reference. Image 2: rendered native SwiftUI build.`,
        },
        { type: "input_image", image_url: imageDataUrl(input.reference) },
        { type: "input_image", image_url: imageDataUrl(input.rendered) },
      ]),
    },
    (v) => Critique.parse(v),
    opts,
  );
}

export async function improveCode(
  input: {
    reference: Buffer;
    rendered: Buffer | null;
    spec: DesignSpec;
    issues: Critique["issues"];
    instruction: string;
    files: Array<{ path: string; contents: string }>;
    platform: Platform;
    assets: Array<{ name: string; usage: string; aspect: string }>;
  },
  opts: StageOpts,
): Promise<StageResult<CodegenResult>> {
  const issues = input.issues.length
    ? input.issues.map((i) => `${i.priority}. [${i.severity}/${i.category}] ${i.title} — ${i.detail} Fix: ${i.suggestedFix}`).join("\n")
    : "(none selected)";
  const content: InputContent[] = [
    {
      type: "input_text",
      text: `Developer instruction: ${input.instruction || "(none — fix the selected issues)"}\n\nSelected QA issues (priority order):\n${issues}\n\nDesign specification:\n${JSON.stringify(input.spec)}\n\nImage 1 is the original reference.${input.rendered ? " Image 2 is the current build." : " No screenshot of the current build is available."}\n\n${assetsNote(input.assets)}\n\nCurrent sources:\n${filesBlock(input.files)}`,
    },
    { type: "input_image", image_url: imageDataUrl(input.reference) },
  ];
  if (input.rendered) content.push({ type: "input_image", image_url: imageDataUrl(input.rendered) });
  return createStructuredResponse(
    {
      model: MODELS.spark,
      instructions: improveInstructions(input.platform),
      reasoning: { effort: EFFORT.improve, summary: "auto" },
      schemaName: "swiftui_project",
      schema: SCHEMAS.codegen,
      input: userMessage(content),
    },
    (v) => CodegenResult.parse(v),
    opts,
  );
}
