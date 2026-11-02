import "server-only";
import path from "node:path";

/** Model identifiers, as listed by GET /v1/models on Meta Model API. */
export const MODELS = {
  spark: "muse-spark-1.3",
  sam: "sam-3.1",
  image: "muse-image-1.0",
} as const;

export const LIMITS = {
  maxUploadBytes: 10 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  /** Long edge of the PNG sent to the models. */
  modelImageLongEdge: 2048,
  maxPromptChars: 4000,
  maxGeneratedFiles: 24,
  maxGeneratedFileBytes: 120_000,
  buildRepairAttempts: 2,
  /** Long edge of Muse Image assets bundled into generated apps. */
  assetLongEdge: 1200,
} as const;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function metaApiKey(): string {
  const key = env("MODEL_API_KEY");
  if (!key) {
    throw new Error("MODEL_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  return key;
}

export function hasMetaApiKey(): boolean {
  return env("MODEL_API_KEY") !== undefined;
}

export const META_BASE_URL = env("META_API_BASE_URL") ?? "https://api.meta.ai/v1";

// Runtime workspace paths (not source files): excluded from Turbopack's file tracing.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ env("UIEE_DATA_DIR") ?? path.join(process.cwd(), "data"));
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const DERIVED_DATA_DIR = path.resolve(/*turbopackIgnore: true*/ env("UIEE_DERIVED_DATA_DIR") ?? path.join(DATA_DIR, "derived-data"));

export const IOS_SIMULATOR = env("UIEE_IOS_SIMULATOR") ?? "iPhone 18 Pro";
export const BUILD_TIMEOUT_MS = Number(env("UIEE_BUILD_TIMEOUT_MS") ?? 420_000);
