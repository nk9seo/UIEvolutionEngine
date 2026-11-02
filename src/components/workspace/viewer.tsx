"use client";

import { Hammer, ImageOff, Loader2, RotateCcw, ScanSearch, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, assetUrl } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Project, Version } from "@/lib/types";
import { Empty, Panel, PanelHeader, Pill } from "./primitives";

export function Viewer({ project, version, onChanged }: { project: Project; version: Version | null; onChanged: () => void }) {
  const reference = assetUrl(project.id, project.reference.file);
  const native = version?.preview?.status === "captured" && version.preview.image ? assetUrl(project.id, version.preview.image) : null;
  const overlay = version?.segmentation?.overlay ? assetUrl(project.id, version.segmentation.overlay) : null;
  const [tab, setTab] = useState("compare");

  return (
    <Panel className="h-full">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <PanelHeader title="Canvas" icon={<SplitSquareHorizontal />}>
          <TabsList className="h-7">
            <TabsTrigger value="compare" className="text-xs">Side by side</TabsTrigger>
            <TabsTrigger value="slider" className="text-xs" disabled={!native}>Before / After</TabsTrigger>
            <TabsTrigger value="sam" className="text-xs" disabled={!overlay}>SAM 3.1</TabsTrigger>
            <TabsTrigger value="native" className="text-xs">Native</TabsTrigger>
          </TabsList>
        </PanelHeader>

        <TabsContent value="compare" className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-border">
          <Frame label="Reference" sub={`${project.reference.width}×${project.reference.height} · uploaded`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reference} alt="Reference" className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
          </Frame>
          <Frame label={version ? `Native · v${version.number}` : "Native"} sub={nativeSub(version)}>
            <NativeShot project={project} version={version} src={native} onChanged={onChanged} />
          </Frame>
        </TabsContent>

        <TabsContent value="slider" className="min-h-0 flex-1">
          {native ? <BeforeAfter before={reference} after={native} /> : null}
        </TabsContent>

        <TabsContent value="sam" className="min-h-0 flex-1">
          {overlay && version?.segmentation ? (
            <Frame
              label="SAM 3.1 segmentation"
              sub={`${version.segmentation.objects.length} masks · ${version.segmentation.concepts.join(", ")}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={overlay} alt="SAM segmentation overlay" className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
            </Frame>
          ) : null}
        </TabsContent>

        <TabsContent value="native" className="min-h-0 flex-1">
          <Frame label={version ? `Native · v${version.number}` : "Native"} sub={nativeSub(version)}>
            <NativeShot project={project} version={version} src={native} onChanged={onChanged} large />
          </Frame>
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function nativeSub(v: Version | null) {
  if (!v) return "not generated yet";
  if (v.preview?.status === "captured") return v.preview.target ?? "";
  if (v.status === "running") return "in progress";
  return v.preview?.note ? "preview unavailable" : v.status === "build-failed" ? "build failed" : "no preview";
}

function Frame({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="checker relative flex min-h-0 min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-[11px]">
        <span className="font-semibold text-foreground/90">{label}</span>
        {sub && <span className="truncate text-muted-foreground">{sub}</span>}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-1">{children}</div>
    </div>
  );
}

function NativeShot({ project, version, src, large, onChanged }: { project: Project; version: Version | null; src: string | null; large?: boolean; onChanged: () => void }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Rendered native app" className={cn("max-h-full max-w-full object-contain shadow-2xl", project.platform === "iOS" ? "rounded-[1.4rem] ring-1 ring-foreground/10" : "rounded-md")} />;
  }
  const running = version?.status === "running";
  const step = project.job?.status === "running" ? project.job.steps.find((s) => s.status === "running") : undefined;
  if (running) {
    return (
      <Empty icon={<Loader2 className="animate-spin" />} title={step ? step.label : "Working…"} className={large ? "" : "min-h-0"}>
        {step?.detail ?? "The native screenshot appears here once Xcode has built the app and it has been launched."}
      </Empty>
    );
  }
  if (version?.status === "build-failed") {
    return <Empty icon={<Hammer />} title="The generated project did not compile">See Build for the compiler diagnostics and repair attempts.</Empty>;
  }
  if (version?.preview && version.preview.status !== "captured") {
    return (
      <Empty icon={<ImageOff />} title={version.preview.status === "unavailable" ? "Preview unavailable" : "Preview failed"}>
        {version.preview.note} The app was built successfully; no screenshot is shown instead of a fake one.
        {version.build?.status === "succeeded" && project.job?.status !== "running" && (
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => api.recapture(project.id, version.number).then(onChanged).catch(() => undefined)}>
            <RotateCcw />
            Relaunch &amp; capture again
          </Button>
        )}
      </Empty>
    );
  }
  return <Empty icon={<ScanSearch />} title="No native build yet">Start a transformation to compile and render the SwiftUI app.</Empty>;
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="checker relative flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between px-3 text-[11px]">
        <Pill>Before · reference</Pill>
        <span className="text-muted-foreground">Drag to compare</span>
        <Pill tone="info">After · native</Pill>
      </div>
      <div className="relative min-h-0 flex-1 p-4 pt-1">
        <div className="relative size-full select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt="Before" className="absolute inset-0 size-full object-contain" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={after}
            alt="After"
            className="absolute inset-0 size-full object-contain"
            style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-y-0 w-px bg-primary shadow-[0_0_12px_2px] shadow-primary/60" style={{ left: `${pos}%` }} />
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Before/after position"
            className="absolute inset-0 size-full cursor-ew-resize opacity-0"
          />
        </div>
      </div>
    </div>
  );
}
