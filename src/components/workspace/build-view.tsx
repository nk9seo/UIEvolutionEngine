"use client";

import { Hammer, Wrench } from "lucide-react";
import { formatDuration } from "@/lib/client";
import type { Version } from "@/lib/types";
import { Empty, Pill, SectionTitle, Warning } from "./primitives";

export function BuildView({ version, onOpenLog }: { version: Version | null; onOpenLog: (file: string) => void }) {
  const build = version?.build;
  if (!build) {
    return (
      <div className="p-3">
        <Empty icon={<Hammer />} title="Not built yet">
          The generated sources are compiled with xcodebuild in an isolated project. Compiler errors are sent back to Muse Spark for automatic repair.
        </Empty>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <Pill tone={build.status === "succeeded" ? "success" : "danger"}>{build.status === "succeeded" ? "BUILD SUCCEEDED" : "BUILD FAILED"}</Pill>
        <Pill>{build.sdk}</Pill>
        <Pill>{build.attempts.length} attempt{build.attempts.length === 1 ? "" : "s"}</Pill>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatDuration(build.durationMs)}</span>
      </div>

      <div className="flex flex-col gap-2">
        {build.attempts.map((a) => {
          const errors = a.diagnostics.filter((d) => d.severity === "error");
          const warnings = a.diagnostics.filter((d) => d.severity === "warning");
          return (
            <div key={a.attempt} className="rounded-lg border bg-muted/20 p-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">Attempt {a.attempt}</span>
                <Pill tone={a.status === "succeeded" ? "success" : a.status === "rejected" ? "warning" : "danger"}>{a.status === "rejected" ? "policy rejected" : a.status}</Pill>
                {errors.length > 0 && <Pill tone="danger">{errors.length} errors</Pill>}
                {warnings.length > 0 && <Pill tone="warning">{warnings.length} warnings</Pill>}
                <button className="ml-auto text-[11px] text-primary hover:underline" onClick={() => onOpenLog(a.logFile)}>
                  View log
                </button>
              </div>
              {errors.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 font-mono text-[11px] leading-relaxed">
                  {errors.slice(0, 8).map((d, i) => (
                    <li key={i} className="break-words text-destructive/90">
                      <span className="text-muted-foreground">{d.file ? `${d.file}:${d.line}` : "project"}</span> {d.message}
                    </li>
                  ))}
                  {errors.length > 8 && <li className="text-muted-foreground">…and {errors.length - 8} more</li>}
                </ul>
              )}
              {a.repair && (
                <p className="mt-2 flex gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs leading-relaxed">
                  <Wrench className="mt-0.5 size-3 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium">Muse Spark repair:</span> {a.repair}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {version?.preview && (
        <div>
          <SectionTitle>Runtime preview</SectionTitle>
          <div className="rounded-lg border bg-muted/20 p-2.5 text-xs leading-relaxed">
            <div className="flex items-center gap-2">
              <Pill tone={version.preview.status === "captured" ? "success" : "warning"}>{version.preview.status}</Pill>
              <span className="truncate">{version.preview.target}</span>
            </div>
            {version.preview.method && <p className="mt-1 text-muted-foreground">{version.preview.method}</p>}
          </div>
          {version.preview.status !== "captured" && version.preview.note && <div className="mt-2"><Warning>{version.preview.note}</Warning></div>}
        </div>
      )}

      <div>
        <SectionTitle>Isolation</SectionTitle>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>Fresh Xcode project per version under data/projects; existing projects are never touched.</li>
          <li>Fixed command allowlist (xcodebuild, xcrun simctl, screencapture) with argv arrays and timeouts — no shell, no model-chosen commands.</li>
          <li>Static source policy blocks processes, file system, network, pasteboard and dynamic loading before compiling.</li>
          <li>macOS builds run under App Sandbox.</li>
        </ul>
      </div>
    </div>
  );
}
