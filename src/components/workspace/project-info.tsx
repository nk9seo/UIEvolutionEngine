"use client";

import { Download, Hammer, Laptop, Loader2, RefreshCw, Smartphone, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, assetUrl } from "@/lib/client";
import type { Project, Version } from "@/lib/types";
import { Pill, SectionTitle } from "./primitives";

export function ProjectInfo({ project, version, onChanged }: { project: Project; version: Version | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = project.job?.status === "running";

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <div>
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={project.name}>
            {project.name}
          </h2>
          <Pill tone="info">
            {project.platform === "macOS" ? <Laptop /> : <Smartphone />}
            {project.platform}
          </Pill>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Created {new Date(project.createdAt).toLocaleString()} · {project.versions.length} version{project.versions.length === 1 ? "" : "s"}
        </p>
      </div>

      <div>
        <SectionTitle aside={<span className="text-[11px] text-muted-foreground">{project.reference.width}×{project.reference.height}</span>}>
          Reference
        </SectionTitle>
        <a href={assetUrl(project.id, project.reference.file)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(project.id, project.reference.file)} alt="Reference screenshot" className="checker max-h-56 w-full object-contain" />
        </a>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{project.reference.originalName}</p>
      </div>

      <div>
        <SectionTitle>Design prompt</SectionTitle>
        <p className="rounded-lg border bg-muted/30 p-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">{project.prompt}</p>
      </div>

      {project.constraints && (
        <div>
          <SectionTitle>Constraints</SectionTitle>
          <p className="rounded-lg border bg-muted/30 p-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">{project.constraints}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Pill>muse-spark-1.3</Pill>
        {project.useSegmentation && <Pill>sam-3.1</Pill>}
        {project.useImageAssets && <Pill>muse-image-1.0</Pill>}
        <Pill>Xcode build</Pill>
      </div>

      {version && version.files.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
          <SectionTitle aside={<Pill tone={version.status === "ready" ? "success" : version.status === "running" ? "info" : "danger"}>{version.status}</Pill>}>
            Take v{version.number} further
          </SectionTitle>
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            A real Xcode project: {version.files.length} SwiftUI files{version.assets?.length ? ` and ${version.assets.length} Muse Image asset${version.assets.length === 1 ? "" : "s"}` : ""}. Keep building on it like any other app.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" onClick={() => act(() => api.openInXcode(project.id, version.number))} disabled={busy}>
              <Hammer />
              Open in Xcode
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={api.downloadUrl(project.id, version.number)} download>
                <Download />
                Download .zip
              </a>
            </Button>
          </div>
        </div>
      )}

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}

      {running ? (
        <Button variant="outline" onClick={() => act(() => api.cancel(project.id))} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Square />}
          Stop current job
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => act(() => api.regenerate(project.id))} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Regenerate from scratch
        </Button>
      )}
      <p className="-mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Every run creates a new version. Earlier versions, sources and screenshots are never overwritten.
      </p>
    </div>
  );
}
