import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { IOS_SIMULATOR, PROJECTS_DIR } from "@/lib/config";
import { imageSize } from "@/lib/images";
import type { Preview } from "@/lib/types";
import { runTool } from "@/lib/xcode/exec";
import { APP_TARGET_NAME } from "@/lib/xcode/template";

type SimDevice = { name: string; udid: string; state: string; isAvailable?: boolean; runtime: string };

// One simulator/capture session at a time across all jobs.
const g = globalThis as unknown as { __uieePreviewLock?: Promise<unknown> };
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__uieePreviewLock ?? Promise.resolve();
  const next = prev.then(fn, fn);
  g.__uieePreviewLock = next.catch(() => undefined);
  return next;
}

export async function listIosSimulators(): Promise<SimDevice[]> {
  const r = await runTool("xcrun", ["simctl", "list", "devices", "available", "-j"], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`simctl list failed: ${r.stderr.trim() || r.code}`);
  const json = JSON.parse(r.stdout) as { devices: Record<string, Array<Omit<SimDevice, "runtime">>> };
  const out: SimDevice[] = [];
  for (const [runtime, devices] of Object.entries(json.devices)) {
    if (!/SimRuntime\.iOS-/.test(runtime)) continue;
    for (const d of devices) if (d.isAvailable !== false) out.push({ ...d, runtime });
  }
  return out;
}

export async function pickSimulator(): Promise<SimDevice | null> {
  const devices = await listIosSimulators();
  const preferred = devices.filter((d) => d.udid === IOS_SIMULATOR || d.name === IOS_SIMULATOR);
  const booted = (list: SimDevice[]) => list.find((d) => d.state === "Booted") ?? list[0];
  return (
    booted(preferred) ??
    devices.find((d) => d.state === "Booted" && /^iPhone/.test(d.name)) ??
    devices.find((d) => /^iPhone \d+ Pro$/.test(d.name)) ??
    devices.find((d) => /^iPhone/.test(d.name)) ??
    null
  );
}

async function simctl(args: string[], timeoutMs: number, what: string) {
  const r = await runTool("xcrun", ["simctl", ...args], { timeoutMs });
  if (r.timedOut) throw new Error(`${what} timed out after ${Math.round(timeoutMs / 1000)}s`);
  if (r.code !== 0) throw new Error(`${what} failed: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
  return r;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function previewOnSimulator(opts: {
  appPath: string;
  bundleId: string;
  outFile: string;
  appearance: "light" | "dark";
  onStatus?: (s: string) => void;
}): Promise<Preview> {
  return exclusive(async () => {
    const device = await pickSimulator();
    if (!device) {
      return { status: "unavailable", note: "No available iOS simulator was found (xcrun simctl list devices available)." };
    }
    const target = `${device.name} (${device.runtime.replace(/.*SimRuntime\./, "").replace(/-/g, ".").replace(/^iOS\./, "iOS ")})`;
    try {
      if (device.state !== "Booted") {
        opts.onStatus?.(`Booting ${device.name}…`);
        await simctl(["boot", device.udid], 120_000, "Simulator boot").catch((e: Error) => {
          if (!/current state: Booted/i.test(e.message)) throw e;
        });
        await simctl(["bootstatus", device.udid, "-b"], 240_000, "Simulator boot status");
      }
      await simctl(["ui", device.udid, "appearance", opts.appearance], 20_000, "Set appearance").catch(() => undefined);
      await simctl(
        ["status_bar", device.udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--cellularBars", "4", "--wifiBars", "3"],
        20_000,
        "Status bar override",
      ).catch(() => undefined);
      opts.onStatus?.(`Installing on ${device.name}…`);
      await simctl(["install", device.udid, opts.appPath], 240_000, "App install");
      opts.onStatus?.(`Launching on ${device.name}…`);
      // `simctl launch` sometimes never returns on a busy simulator even though the app
      // started, so bound it and then verify the process inside the simulator.
      const launch = await runTool("xcrun", ["simctl", "launch", "--terminate-running-process", device.udid, opts.bundleId], { timeoutMs: 45_000 });
      if (!launch.timedOut && launch.code !== 0) throw new Error(`App launch failed: ${(launch.stderr || launch.stdout).trim().slice(0, 400)}`);
      if ((await isAppRunning(device.udid, opts.bundleId)) === false) {
        throw new Error("The app is not running in the simulator after launch (it may have crashed on startup).");
      }

      opts.onStatus?.("Waiting for the first rendered frame…");
      const shot = await captureStableFrame(device.udid, opts.outFile);
      if ((await isAppRunning(device.udid, opts.bundleId)) === false) {
        throw new Error("The app exited while rendering (likely a runtime crash).");
      }
      const size = await imageSize(await fs.readFile(opts.outFile));
      return {
        status: "captured",
        image: opts.outFile,
        target,
        method: `xcrun simctl io screenshot (${size.width}×${size.height})${shot.stable ? "" : " · frame still changing"}`,
      };
    } catch (err) {
      return { status: "failed", target, note: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** true/false when launchd inside the simulator answered; null when it could not be asked in time. */
async function isAppRunning(udid: string, bundleId: string): Promise<boolean | null> {
  const r = await runTool("xcrun", ["simctl", "spawn", udid, "launchctl", "list"], { timeoutMs: 60_000 }).catch(() => null);
  if (!r || r.timedOut || r.code !== 0) return null;
  return r.stdout.includes(`UIKitApplication:${bundleId}[`);
}

/** A tiny grayscale thumbnail used to detect blank (launching) and still-changing frames. */
async function fingerprint(file: string) {
  const { data, info } = await sharp(file).greyscale().resize(48, 96, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  // Ignore the status bar (top) and home indicator (bottom): they are drawn even on a blank launch screen.
  const body = data.subarray(info.width * 8, info.width * 90);
  let sum = 0;
  for (const v of body) sum += v;
  const mean = sum / body.length;
  let varSum = 0;
  for (const v of body) varSum += (v - mean) ** 2;
  return { data, stdev: Math.sqrt(varSum / body.length), pixels: info.width * info.height };
}

/**
 * Takes screenshots until the frame is non-blank and two consecutive frames match
 * (launch screens are a flat color; the first real frame may still be animating).
 */
async function captureStableFrame(udid: string, outFile: string) {
  const tmp = `${outFile}.tmp.png`;
  let prev: Awaited<ReturnType<typeof fingerprint>> | null = null;
  const deadline = Date.now() + 45_000;
  await sleep(2500);
  while (true) {
    await simctl(["io", udid, "screenshot", "--type=png", tmp], 60_000, "Screenshot");
    const fp = await fingerprint(tmp);
    const blank = fp.stdev < 3;
    let stable = false;
    if (prev && !blank) {
      let diff = 0;
      for (let i = 0; i < fp.data.length; i++) diff += Math.abs(fp.data[i] - prev.data[i]);
      stable = diff / fp.pixels < 1.5;
    }
    if ((stable && !blank) || Date.now() > deadline) {
      await fs.rename(tmp, outFile);
      return { stable, blank };
    }
    prev = blank ? null : fp;
    await sleep(1500);
  }
}

/**
 * Launches the generated macOS app (sandboxed, from inside data/projects only),
 * captures its window, and terminates it.
 */
export async function previewOnMac(opts: { appPath: string; outFile: string; onStatus?: (s: string) => void }): Promise<Preview> {
  const appPath = path.resolve(opts.appPath);
  if (!appPath.startsWith(path.resolve(PROJECTS_DIR) + path.sep) || path.basename(appPath) !== `${APP_TARGET_NAME}.app`) {
    throw new Error("Refusing to launch an app outside the generated workspace");
  }
  const binary = path.join(appPath, "Contents", "MacOS", APP_TARGET_NAME);
  await fs.access(binary);

  return exclusive(
    () =>
      new Promise<Preview>((resolve) => {
        opts.onStatus?.("Launching the generated macOS app…");
        const child = spawn(binary, [], {
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            NODE_ENV: process.env.NODE_ENV,
            HOME: process.env.HOME ?? "",
            USER: process.env.USER ?? "",
            PATH: "/usr/bin:/bin",
            TMPDIR: process.env.TMPDIR ?? "/tmp",
            UIEE_CAPTURE: "1",
          },
        });
        let done = false;
        let buffer = "";
        const finish = (p: Preview) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 3000).unref();
          resolve(p);
        };
        const timer = setTimeout(
          () => finish({ status: "failed", target: "macOS (this Mac)", note: "The app did not report a window within 40s." }),
          40_000,
        );

        child.on("error", (err) => finish({ status: "failed", target: "macOS (this Mac)", note: err.message }));
        child.on("exit", (code) => finish({ status: "failed", target: "macOS (this Mac)", note: `The app exited early (code ${code}).` }));
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", async (chunk: string) => {
          buffer += chunk;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            const wid = line.match(/^UIEE_WINDOW_ID=(\d+)$/);
            if (wid) {
              opts.onStatus?.("Capturing the app window…");
              const r = await runTool("screencapture", ["-x", "-o", "-t", "png", "-l", wid[1], opts.outFile], { timeoutMs: 20_000 }).catch(() => null);
              const ok = r?.code === 0 && (await fs.stat(opts.outFile).catch(() => null))?.size;
              if (ok) {
                const size = await imageSize(await fs.readFile(opts.outFile));
                finish({ status: "captured", image: opts.outFile, target: "macOS (this Mac)", method: `screencapture -l window (${size.width}×${size.height})` });
              } else {
                // No Screen Recording permission: ask the app to render its own window.
                child.stdin.write("fallback\n");
              }
            }
            const png = line.match(/^UIEE_PNG_BASE64=(.*)$/);
            if (png) {
              if (!png[1]) {
                finish({ status: "failed", target: "macOS (this Mac)", note: "The app could not render its window." });
              } else {
                await fs.writeFile(opts.outFile, Buffer.from(png[1], "base64"));
                finish({
                  status: "captured",
                  image: opts.outFile,
                  target: "macOS (this Mac)",
                  method: "in-app cacheDisplay fallback (grant Screen Recording to the terminal for exact capture; vibrancy may render flat)",
                });
              }
            }
          }
        });
      }),
  );
}
