"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, ProjectSummary, SystemStatus } from "@/lib/types";

export function assetUrl(projectId: string, rel: string) {
  return `/api/projects/${projectId}/assets/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

export const api = {
  status: () => fetch("/api/status", { cache: "no-store" }).then((r) => json<SystemStatus>(r)),
  projects: () => fetch("/api/projects", { cache: "no-store" }).then((r) => json<{ projects: ProjectSummary[] }>(r)),
  project: (id: string) => fetch(`/api/projects/${id}`, { cache: "no-store" }).then((r) => json<{ project: Project }>(r)),
  create: (form: FormData) => fetch("/api/projects", { method: "POST", body: form }).then((r) => json<{ id: string }>(r)),
  regenerate: (id: string) => fetch(`/api/projects/${id}/generate`, { method: "POST" }).then((r) => json<{ version: number }>(r)),
  improve: (id: string, body: { parent: number; instruction: string; issueIds: string[] }) =>
    fetch(`/api/projects/${id}/improve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
      json<{ version: number }>(r),
    ),
  recapture: (id: string, version: number) =>
    fetch(`/api/projects/${id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) }).then((r) =>
      json<{ version: number }>(r),
    ),
  openInXcode: (id: string, version: number) =>
    fetch(`/api/projects/${id}/open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) }).then((r) =>
      json<{ ok: true }>(r),
    ),
  downloadUrl: (id: string, version: number) => `/api/projects/${id}/download?version=${version}`,
  cancel: (id: string) => fetch(`/api/projects/${id}/cancel`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  text: (id: string, rel: string) =>
    fetch(assetUrl(id, rel), { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    }),
};

/**
 * Loads a project and polls it while a job is running. `onUpdate` receives the
 * previous and next snapshot so callers can react to transitions (new version, job finished).
 */
export function useProject(id: string | null, onUpdate?: (prev: Project | null, next: Project) => void) {
  const [state, setState] = useState<{ id: string; project: Project } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const onUpdateRef = useRef(onUpdate);
  const lastRef = useRef<Project | null>(null);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const { project } = await api.project(id);
        if (cancelled) return;
        const prev = lastRef.current?.id === id ? lastRef.current : null;
        lastRef.current = project;
        setState({ id, project });
        setError(null);
        onUpdateRef.current?.(prev, project);
        if (project.job?.status === "running") timer = setTimeout(tick, 1200);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        timer = setTimeout(tick, 4000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { project: state && state.id === id ? state.project : null, error, reload };
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function elapsed(start?: string, end?: string) {
  if (!start) return "";
  return formatDuration((end ? Date.parse(end) : Date.now()) - Date.parse(start));
}
