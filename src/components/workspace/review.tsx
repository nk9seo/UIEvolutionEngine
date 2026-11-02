"use client";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Project, Version } from "@/lib/types";
import { Empty, Pill, SectionTitle } from "./primitives";

const SEVERITY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

/** Muse Spark's visual comparison of reference vs. rendered build, plus one-click iteration. */
export function Review({ project, version, onStarted }: { project: Project; version: Version | null; onStarted: () => void }) {
  const critique = version?.critique;
  // Preselect high/medium issues. The parent remounts this component (key) per version/critique.
  const [selected, setSelected] = useState<string[]>(() => critique?.issues.filter((i) => i.severity !== "low").map((i) => i.id) ?? []);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = project.job?.status === "running";

  const canImprove = !!version && version.files.length > 0 && !!version.spec && !running;

  const improve = async () => {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api.improve(project.id, { parent: version.number, instruction: instruction.trim(), issueIds: selected });
      setInstruction("");
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-3">
      {critique ? (
        <>
          <div className="flex items-center gap-4">
            <ScoreRing value={critique.overallScore} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed text-foreground/85">{critique.summary}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(critique.scores).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className="w-24 shrink-0 text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", v >= 8 ? "bg-success" : v >= 5 ? "bg-warning" : "bg-destructive")} style={{ width: `${v * 10}%` }} />
                </span>
                <span className="w-5 text-right tabular-nums">{v}</span>
              </div>
            ))}
          </div>

          <div>
            <SectionTitle aside={<span className="text-[11px] text-muted-foreground">{selected.length} selected</span>}>Improvement plan</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {critique.issues.map((i) => {
                const on = selected.includes(i.id);
                return (
                  <label key={i.id} className={cn("flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors", on ? "border-primary/40 bg-primary/5" : "bg-muted/20 hover:bg-muted/40")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setSelected((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))}
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">#{i.priority}</span>
                        <span className="text-[13px] font-medium">{i.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill>
                        <Pill>{i.category}</Pill>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{i.detail}</p>
                      <p className="mt-1 text-xs leading-relaxed"><span className="text-primary">Fix:</span> {i.suggestedFix}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {critique.strengths.length > 0 && (
            <div>
              <SectionTitle>Strengths</SectionTitle>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-foreground/80 marker:text-muted-foreground">
                {critique.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <Empty icon={<Sparkles />} title="No visual review yet">
          {version?.status === "running"
            ? "Muse Spark compares the rendered app with the reference once the simulator screenshot is captured."
            : version?.preview?.status === "captured"
              ? "The visual comparison did not complete for this version."
              : "A review needs a rendered screenshot. You can still request an improvement with an instruction below."}
        </Empty>
      )}

      <div className="sticky bottom-0 -mx-3 -mb-3 border-t bg-card/95 p-3 backdrop-blur">
        <SectionTitle>Iterate</SectionTitle>
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Optional instruction, e.g. “make the stat cards more compact and add a search field”"
          className="resize-none text-[13px]"
          disabled={!canImprove}
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <Button className="mt-2 w-full" onClick={improve} disabled={!canImprove || busy || (selected.length === 0 && !instruction.trim())}>
          {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {version ? `Improve v${version.number} → new version` : "Improve"}
        </Button>
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = v >= 80 ? "var(--success)" : v >= 55 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none font-semibold tabular-nums">{v}</span>
        <span className="text-[9px] text-muted-foreground">/ 100</span>
      </span>
    </div>
  );
}
