import type { Platform } from "@/lib/schemas";
import type { BuildDiagnostic } from "@/lib/types";

/**
 * Static policy for model-generated Swift. Generated apps are UI only: they run
 * on this Mac (macOS, under App Sandbox) or in the simulator, so anything that
 * reaches outside the view layer is refused before the code is ever
 * compiled or launched (violating files are kept on disk only for inspection).
 * Violations are fed back to Muse Spark like compiler errors.
 */

const ALLOWED_IMPORTS: Record<Platform, Set<string>> = {
  iOS: new Set(["SwiftUI", "Foundation", "Observation", "Charts", "UIKit", "Combine"]),
  macOS: new Set(["SwiftUI", "Foundation", "Observation", "Charts", "AppKit", "Combine"]),
};

const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  { re: /@main\b/, why: "@main is reserved for the fixed app harness; provide `struct RootView: View` instead" },
  { re: /\bProcess\s*\(|\bNSTask\b|\bposix_spawn|\bpopen\s*\(|(?<![.\w])system\s*\(|(?<![.\w])execv?p?\s*\(/, why: "spawning processes is not allowed" },
  { re: /\bdlopen\b|\bdlsym\b|@_silgen_name|@_cdecl|\bNSAppleScript\b|\bOSAScript\b/, why: "dynamic loading and scripting are not allowed" },
  { re: /\bFileManager\b|\bFileHandle\b|\bfopen\s*\(|\.write\s*\(\s*to(File)?\s*:/, why: "file system access is not allowed" },
  { re: /\bURLSession\b|\bNWConnection\b|\bCFStream|\bAsyncImage\b/, why: "network access is not allowed; use SF Symbols or shapes for imagery" },
  { re: /\bNSPasteboard\b|\bUIPasteboard\b/, why: "pasteboard access is not allowed (the simulator clipboard is shared with the Mac)" },
  { re: /\bNSWorkspace\b|\bUIApplication\.shared\.open\b|\bopenURL\b/, why: "launching other apps or URLs is not allowed" },
  { re: /\bUserDefaults\b|@AppStorage|@SceneStorage/, why: "persistent storage is not allowed in generated previews" },
  { re: /\bunsafeBitCast\b|\bUnsafeMutableRawPointer\b|\bUnsafeMutablePointer\b/, why: "unsafe pointer operations are not allowed" },
];

export type PolicyFile = { path: string; contents: string };

function lineOf(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - before.lastIndexOf("\n") };
}

/** Blanks out comments and string-literal contents so prose cannot trigger rules. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/"""[\s\S]*?"""/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`);
}

export function checkSourcePolicy(files: PolicyFile[], platform: Platform): BuildDiagnostic[] {
  const out: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  const allowed = ALLOWED_IMPORTS[platform];
  let hasRootView = false;

  for (const f of files) {
    const key = f.path.toLowerCase();
    if (seen.has(key)) {
      out.push({ file: f.path, line: 1, column: 1, severity: "error", message: "Duplicate file path" });
    }
    seen.add(key);
    if (/(^|\/)GeneratedApp\.swift$/.test(f.path)) {
      out.push({ file: f.path, line: 1, column: 1, severity: "error", message: "GeneratedApp.swift is reserved for the app harness" });
    }

    const code = codeOnly(f.contents);
    if (/\bstruct\s+RootView\s*:\s*View\b/.test(code)) hasRootView = true;

    for (const m of code.matchAll(/^\s*(?:@testable\s+|@_exported\s+)?import\s+(?:(?:struct|class|enum|protocol|func|var|typealias)\s+)?([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      if (!allowed.has(m[1])) {
        const pos = lineOf(f.contents, m.index ?? 0);
        out.push({ file: f.path, ...pos, severity: "error", message: `import ${m[1]} is not allowed on ${platform}; allowed: ${[...allowed].join(", ")}` });
      }
    }
    for (const rule of FORBIDDEN) {
      const m = rule.re.exec(code);
      if (m) {
        const pos = lineOf(f.contents, m.index);
        out.push({ file: f.path, ...pos, severity: "error", message: `Policy: ${rule.why} (found "${m[0].trim()}")` });
      }
    }
  }

  if (!hasRootView) {
    out.push({ file: files[0]?.path ?? "RootView.swift", line: 1, column: 1, severity: "error", message: "Missing `struct RootView: View` (the harness entry view)" });
  }
  return out;
}
