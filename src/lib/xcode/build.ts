import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { BUILD_TIMEOUT_MS, DERIVED_DATA_DIR } from "@/lib/config";
import type { Platform } from "@/lib/schemas";
import { relativeToProject, versionDir } from "@/lib/storage/projects";
import type { BuildDiagnostic } from "@/lib/types";
import { runTool } from "@/lib/xcode/exec";
import { APP_TARGET_NAME, renderAppEntry, renderPbxproj } from "@/lib/xcode/template";

export function xcodeDir(projectId: string, version: number) {
  return path.join(versionDir(projectId, version), "xcode");
}

export function appSourcesDir(projectId: string, version: number) {
  return path.join(xcodeDir(projectId, version), APP_TARGET_NAME);
}

export function bundleIdFor(projectId: string) {
  return `dev.uiee.generated.${projectId.replace(/[^a-z0-9]/g, "")}`;
}

/** Writes a fresh, isolated Xcode project for one version. Only ever touches data/projects/<id>/versions/vN/xcode. */
export async function writeXcodeProject(opts: {
  projectId: string;
  version: number;
  platform: Platform;
  appName: string;
  window: { width: number; height: number };
  files: Array<{ path: string; contents: string }>;
  /** Muse Image PNGs (absolute paths inside the project) copied to Resources/<name>.png. */
  assets?: Array<{ name: string; file: string }>;
}) {
  const root = xcodeDir(opts.projectId, opts.version);
  const src = appSourcesDir(opts.projectId, opts.version);
  await fs.rm(src, { recursive: true, force: true });
  await fs.mkdir(path.join(root, `${APP_TARGET_NAME}.xcodeproj`), { recursive: true });
  await fs.mkdir(src, { recursive: true });

  await fs.writeFile(
    path.join(root, `${APP_TARGET_NAME}.xcodeproj`, "project.pbxproj"),
    renderPbxproj({ platform: opts.platform, bundleId: bundleIdFor(opts.projectId), displayName: opts.appName.slice(0, 40) || "Generated" }),
  );
  await fs.writeFile(
    path.join(src, `${APP_TARGET_NAME}.swift`),
    renderAppEntry({ platform: opts.platform, width: opts.window.width, height: opts.window.height }),
  );
  for (const f of opts.files) {
    const target = path.resolve(src, f.path);
    if (!target.startsWith(src + path.sep)) throw new Error(`Refusing to write outside the generated project: ${f.path}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, f.contents);
  }
  if (opts.assets?.length) {
    await fs.mkdir(path.join(src, "Resources"), { recursive: true });
    for (const a of opts.assets) {
      if (!/^[a-z][A-Za-z0-9]{1,30}$/.test(a.name)) continue;
      await fs.copyFile(a.file, path.join(src, "Resources", `${a.name}.png`));
    }
  }
  return root;
}

/** Opens a version's generated project in Xcode on this Mac. The path is always our own generated project. */
export async function openInXcode(projectId: string, version: number) {
  const proj = path.join(xcodeDir(projectId, version), `${APP_TARGET_NAME}.xcodeproj`);
  await fs.access(path.join(proj, "project.pbxproj"));
  const r = await runTool("open", ["-a", "Xcode", proj], { timeoutMs: 20_000 });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || "Could not open Xcode");
}

/** Every file of a version's Xcode project (sources, resources, pbxproj), for zipping. */
export async function collectProjectFiles(projectId: string, version: number) {
  const root = xcodeDir(projectId, version);
  const out: Array<{ path: string; data: Buffer }> = [];
  async function walk(dir: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push({ path: path.relative(root, abs).split(path.sep).join("/"), data: await fs.readFile(abs) });
    }
  }
  await walk(root);
  return out;
}

/** Reads back the model-owned sources of a version (the harness file is excluded). */
export async function readGeneratedSources(projectId: string, version: number) {
  const src = appSourcesDir(projectId, version);
  const out: Array<{ path: string; contents: string }> = [];
  async function walk(dir: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.name.endsWith(".swift")) {
        const rel = path.relative(src, abs).split(path.sep).join("/");
        if (rel !== `${APP_TARGET_NAME}.swift`) out.push({ path: rel, contents: await fs.readFile(abs, "utf8") });
      }
    }
  }
  await walk(src);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function parseDiagnostics(log: string, sourcesRoot: string): BuildDiagnostic[] {
  const out: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  const fileRe = /^(\/[^\n:]+\.swift):(\d+):(\d+): (error|warning): (.+)$/gm;
  for (const m of log.matchAll(fileRe)) {
    const rel = m[1].startsWith(sourcesRoot + path.sep) ? path.relative(sourcesRoot, m[1]).split(path.sep).join("/") : path.basename(m[1]);
    const d: BuildDiagnostic = { file: rel, line: Number(m[2]), column: Number(m[3]), severity: m[4] as "error" | "warning", message: m[5].trim() };
    const key = `${d.file}:${d.line}:${d.column}:${d.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  if (!out.some((d) => d.severity === "error")) {
    for (const m of log.matchAll(/^(?:xcodebuild: )?error: (.+)$/gm)) {
      const key = `general:${m[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ file: "", line: 0, column: 0, severity: "error", message: m[1].trim() });
      }
    }
  }
  return out.slice(0, 60);
}

function derivedDataFor(projectId: string, platform: Platform) {
  return path.join(DERIVED_DATA_DIR, `${projectId}-${platform}`);
}

export async function runXcodeBuild(opts: {
  projectId: string;
  version: number;
  platform: Platform;
  attempt: number;
  signal?: AbortSignal;
  onOutput?: (chunk: string) => void;
}) {
  const root = xcodeDir(opts.projectId, opts.version);
  const dd = derivedDataFor(opts.projectId, opts.platform);
  const platformArgs =
    opts.platform === "iOS"
      ? ["-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator"]
      : ["-sdk", "macosx", "-destination", "generic/platform=macOS"];
  const args = [
    "-project", path.join(root, `${APP_TARGET_NAME}.xcodeproj`),
    "-scheme", APP_TARGET_NAME,
    "-configuration", "Debug",
    "-derivedDataPath", dd,
    ...platformArgs,
    "ARCHS=arm64",
    "ONLY_ACTIVE_ARCH=YES",
    "COMPILER_INDEX_STORE_ENABLE=NO",
    "-hideShellScriptEnvironment",
    "build",
  ];
  const result = await runTool("xcodebuild", args, {
    cwd: root,
    timeoutMs: BUILD_TIMEOUT_MS,
    signal: opts.signal,
    onOutput: opts.onOutput,
  });

  const log = `$ xcodebuild ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n\n${result.stdout}\n${result.stderr}`;
  const logPath = path.join(versionDir(opts.projectId, opts.version), `build-${opts.attempt}.log`);
  await fs.writeFile(logPath, log);

  const succeeded = result.code === 0 && !result.timedOut && /\*\* BUILD SUCCEEDED \*\*/.test(result.stdout);
  const diagnostics = parseDiagnostics(log, appSourcesDir(opts.projectId, opts.version));
  if (result.timedOut) {
    diagnostics.unshift({ file: "", line: 0, column: 0, severity: "error", message: `xcodebuild timed out after ${Math.round(BUILD_TIMEOUT_MS / 1000)}s` });
  }

  let appPath: string | null = null;
  if (succeeded) {
    const productDir = opts.platform === "iOS" ? "Debug-iphonesimulator" : "Debug";
    const built = path.join(dd, "Build", "Products", productDir, `${APP_TARGET_NAME}.app`);
    appPath = path.join(versionDir(opts.projectId, opts.version), "app", `${APP_TARGET_NAME}.app`);
    await fs.rm(appPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    // Skip AppleDouble "._*" files that appear when DerivedData lives on an exFAT volume;
    // they would break the bundle's code signature.
    await fs.cp(built, appPath, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (src) => !path.basename(src).startsWith("._"),
    });
  }
  await cleanBuildArtifacts(dd);

  return {
    succeeded,
    diagnostics,
    durationMs: result.durationMs,
    logFile: relativeToProject(opts.projectId, logPath),
    appPath,
    sdk: opts.platform === "iOS" ? "iphonesimulator" : "macosx",
  };
}

/** Removes per-build products and intermediates; keeps the module cache so later builds stay fast. */
async function cleanBuildArtifacts(dd: string) {
  const root = path.resolve(DERIVED_DATA_DIR);
  const target = path.resolve(dd, "Build");
  if (!target.startsWith(root + path.sep)) return;
  await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
}
