import { NextResponse } from "next/server";
import { hasMetaApiKey } from "@/lib/config";
import type { SystemStatus } from "@/lib/types";
import { runTool } from "@/lib/xcode/exec";
import { pickSimulator } from "@/lib/xcode/preview";

/** Environment check shown in the workspace header: API key, Xcode, simulator. Never returns the key. */
export async function GET() {
  const status: SystemStatus = {
    metaApiKey: hasMetaApiKey(),
    xcode: { available: false },
    simulator: { available: false },
    macCapture: "screencapture -l (falls back to in-app rendering without Screen Recording permission)",
  };
  try {
    const r = await runTool("xcodebuild", ["-version"], { timeoutMs: 20_000 });
    if (r.code === 0) status.xcode = { available: true, version: r.stdout.split("\n")[0]?.trim() };
  } catch {
    // xcodebuild missing
  }
  try {
    const sim = await pickSimulator();
    if (sim) status.simulator = { available: true, name: sim.name, udid: sim.udid, state: sim.state };
  } catch {
    // simctl missing
  }
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
