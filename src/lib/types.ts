import type { Critique, DesignSpec, ImplementationPlan, Platform, UIAnalysis } from "@/lib/schemas";

/** State shared between the server and the workspace UI (all JSON-serializable). */

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export type JobStep = {
  key: StepKey;
  label: string;
  status: StepStatus;
  model?: string;
  startedAt?: string;
  endedAt?: string;
  detail?: string;
  /** Live reasoning summary streamed from Muse Spark while the step runs. */
  live?: string;
};

export type StepKey =
  | "prepare"
  | "segment"
  | "analyze"
  | "spec"
  | "assets"
  | "codegen"
  | "improve"
  | "build"
  | "preview"
  | "critique";

export type Job = {
  id: string;
  kind: "generate" | "improve" | "preview";
  versionNumber: number;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  endedAt?: string;
  steps: JobStep[];
  error?: string;
};

export type SegmentationObject = {
  concept: string;
  objectId: string;
  /** Source-pixel box on the reference image. */
  box: { left: number; top: number; right: number; bottom: number };
  confidence: number | null;
};

export type Segmentation = {
  model: string;
  concepts: string[];
  objects: SegmentationObject[];
  imageWidth: number;
  imageHeight: number;
  overlay: string | null;
  durationMs: number;
};

export type BuildDiagnostic = {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  message: string;
};

export type BuildAttempt = {
  attempt: number;
  status: "succeeded" | "failed" | "rejected";
  durationMs: number;
  diagnostics: BuildDiagnostic[];
  /** Muse Spark's explanation when it repaired the sources for the next attempt. */
  repair?: string;
  logFile: string;
};

export type BuildResult = {
  status: "succeeded" | "failed";
  attempts: BuildAttempt[];
  sdk: string;
  durationMs: number;
};

export type Preview = {
  status: "captured" | "unavailable" | "failed";
  image?: string;
  target?: string;
  method?: string;
  note?: string;
};

export type ModelCall = {
  stage: StepKey;
  model: string;
  responseId: string;
  durationMs: number;
  usage: Record<string, unknown> | null;
  reasoningSummary: string[];
};

export type SourceFile = { path: string; bytes: number };

/** A Muse Image asset bundled into the generated app as Resources/<name>.png. */
export type ImageAsset = {
  name: string;
  prompt: string;
  usage: string;
  aspect: "square" | "landscape" | "portrait";
  file: string;
  width: number;
  height: number;
  model: string;
  durationMs: number;
};

export type Version = {
  number: number;
  parent: number | null;
  kind: "initial" | "improvement";
  createdAt: string;
  status: "running" | "ready" | "build-failed" | "failed";
  prompt: string;
  instruction?: string;
  selectedIssues?: string[];
  analysis?: UIAnalysis;
  segmentation?: Segmentation;
  rationale?: string;
  spec?: DesignSpec;
  plan?: ImplementationPlan;
  assets?: ImageAsset[];
  files: SourceFile[];
  codegenNotes?: string[];
  build?: BuildResult;
  preview?: Preview;
  critique?: Critique;
  modelCalls: ModelCall[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  platform: Platform;
  prompt: string;
  constraints: string;
  useSegmentation: boolean;
  useImageAssets?: boolean;
  reference: { file: string; modelFile: string; width: number; height: number; originalName: string; bytes: number };
  versions: Version[];
  job?: Job;
};

export type ProjectSummary = Pick<Project, "id" | "name" | "createdAt" | "updatedAt" | "platform"> & {
  versions: number;
  status?: Job["status"];
};

export type SystemStatus = {
  metaApiKey: boolean;
  xcode: { available: boolean; version?: string };
  simulator: { available: boolean; name?: string; udid?: string; state?: string };
  macCapture: string;
};
