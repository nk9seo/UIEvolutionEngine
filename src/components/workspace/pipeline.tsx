"use client";

import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { elapsed, formatDuration } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Job, ModelCall, Version } from "@/lib/types";
import { Empty, Pill, SectionTitle, StepIcon } from "./primitives";

const STAGE_LABEL: Record<string, string> = {
  analyze: "Visual understanding",
  spec: "Design specification",
  assets: "Image assets",
  codegen: "SwiftUI generation",
  improve: "Improvement",
  build: "Build repair",
  critique: "Visual comparison",
};

/** Live view of the agent: each pipeline step, its model, timing and streamed reasoning summary. */
export function Pipeline({ job, version }: { job: Job | undefined; version: Version | null }) {
  const [, tick] = useState(0);
  const isLive = job?.status === "running" && job.versionNumber === version?.number;
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  const showJob = job && version && job.versionNumber === version.number;

  return (
    <div className="flex flex-col gap-5 p-3">
      {showJob ? (
        <div>
          <SectionTitle
            aside={
              <Pill tone={job.status === "running" ? "info" : job.status === "succeeded" ? "success" : "danger"}>
                {job.status === "running" ? `running · ${elapsed(job.startedAt)}` : `${job.status} · ${elapsed(job.startedAt, job.endedAt)}`}
              </Pill>
            }
          >
            {job.kind === "generate" ? "Transformation pipeline" : job.kind === "improve" ? `Iteration v${version.parent} → v${version.number}` : `Relaunch v${version.number}`}
          </SectionTitle>
          <ol className="relative flex flex-col">
            {job.steps.map((s, i) => (
              <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
                {i < job.steps.length - 1 && <span className="absolute top-5 bottom-0 left-[7.5px] w-px bg-border" />}
                <StepIcon status={s.status} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] font-medium", s.status === "pending" && "text-muted-foreground")}>{s.label}</span>
                    {s.model && s.status !== "skipped" && <span className="font-mono text-[10px] text-muted-foreground">{s.model}</span>}
                    {s.startedAt && <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{elapsed(s.startedAt, s.endedAt)}</span>}
                  </div>
                  {s.detail && (
                    <p className={cn("mt-0.5 text-xs leading-relaxed break-words", s.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{s.detail}</p>
                  )}
                  {s.live && (
                    <p className="mt-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs leading-relaxed text-foreground/80 italic">
                      <Brain className="mr-1 inline size-3 -translate-y-px text-primary" />
                      {s.live}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {job.error && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{job.error}</p>}
        </div>
      ) : null}

      {version ? <Reasoning calls={version.modelCalls} rationale={version.rationale} notes={version.codegenNotes} /> : <Empty title="No version selected" />}
    </div>
  );
}

function Reasoning({ calls, rationale, notes }: { calls: ModelCall[]; rationale?: string; notes?: string[] }) {
  if (!calls.length && !rationale) return null;
  return (
    <div className="flex flex-col gap-4">
      {rationale && (
        <div>
          <SectionTitle>Design rationale</SectionTitle>
          <p className="text-[13px] leading-relaxed text-foreground/85">{rationale}</p>
        </div>
      )}
      {notes && notes.length > 0 && (
        <div>
          <SectionTitle>Implementation notes</SectionTitle>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed text-foreground/85 marker:text-muted-foreground">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {calls.length > 0 && (
        <div>
          <SectionTitle>Model calls ({calls.length})</SectionTitle>
          <div className="flex flex-col gap-2">
            {calls.map((c, i) => {
              const usage = c.usage as { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } } | null;
              return (
                <div key={i} className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{STAGE_LABEL[c.stage] ?? c.stage}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.model}</span>
                    <span className="ml-auto text-muted-foreground tabular-nums">{formatDuration(c.durationMs)}</span>
                  </div>
                  {usage && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      in {usage.input_tokens ?? "?"} · out {usage.output_tokens ?? "?"}
                      {usage.output_tokens_details?.reasoning_tokens ? ` (reasoning ${usage.output_tokens_details.reasoning_tokens})` : ""} · {c.responseId.slice(0, 18)}…
                    </p>
                  )}
                  {c.reasoningSummary.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-primary/30 pl-2 text-xs leading-relaxed text-foreground/75">
                      {c.reasoningSummary.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
