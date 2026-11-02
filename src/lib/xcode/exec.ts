import "server-only";
import { spawn } from "node:child_process";

/**
 * The only way this app runs external programs. Executables come from a fixed
 * allowlist, arguments are passed as an argv array (never through a shell), and
 * every call has a timeout. Nothing the model produces is ever used as a command.
 */
export const TOOLS = {
  xcodebuild: "/usr/bin/xcodebuild",
  xcrun: "/usr/bin/xcrun",
  screencapture: "/usr/sbin/screencapture",
  /** Only ever called as `open -a Xcode <generated .xcodeproj>`. */
  open: "/usr/bin/open",
} as const;

export type Tool = keyof typeof TOOLS;

export type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number };

export function runTool(
  tool: Tool,
  args: string[],
  opts: { timeoutMs: number; cwd?: string; signal?: AbortSignal; onOutput?: (chunk: string) => void; maxBytes?: number },
): Promise<RunResult> {
  const started = Date.now();
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ TOOLS[tool], args, {
      cwd: opts.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NSUnbufferedIO: "YES" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (cur: string, chunk: string) => (cur.length > maxBytes ? cur : cur + chunk);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      stdout = append(stdout, c);
      opts.onOutput?.(c);
    });
    child.stderr.on("data", (c: string) => {
      stderr = append(stderr, c);
      opts.onOutput?.(c);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, opts.timeoutMs);
    const onAbort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", onAbort);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
  });
}
