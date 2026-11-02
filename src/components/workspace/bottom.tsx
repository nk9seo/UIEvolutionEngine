"use client";

import { Code2, Copy, FileCode2, GitBranch, History, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, formatDuration } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Project, Version } from "@/lib/types";
import { Empty, Panel, PanelHeader, Pill, ScrollBody } from "./primitives";

type Tab = "source" | "log" | "history";

export function BottomPanel({
  project,
  version,
  onSelectVersion,
  tab,
  onTab,
  logFile,
  onLogFile,
}: {
  project: Project;
  version: Version | null;
  onSelectVersion: (n: number) => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  logFile: string | null;
  onLogFile: (f: string) => void;
}) {
  return (
    <Panel className="h-full">
      <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <PanelHeader title={version ? `Version ${version.number}` : "Output"} icon={<Code2 />}>
          <TabsList className="h-7">
            <TabsTrigger value="source" className="text-xs"><FileCode2 />SwiftUI source</TabsTrigger>
            <TabsTrigger value="log" className="text-xs"><ScrollText />Build output</TabsTrigger>
            <TabsTrigger value="history" className="text-xs"><History />Iterations ({project.versions.length})</TabsTrigger>
          </TabsList>
        </PanelHeader>
        <TabsContent value="source" className="min-h-0 flex-1">
          <SourceView project={project} version={version} />
        </TabsContent>
        <TabsContent value="log" className="min-h-0 flex-1">
          <LogView project={project} version={version} logFile={logFile} onLogFile={onLogFile} />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1">
          <HistoryView project={project} selected={version?.number ?? null} onSelect={onSelectVersion} />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function SourceView({ project, version }: { project: Project; version: Version | null }) {
  const files = useMemo(() => {
    if (!version?.files.length) return [];
    return [...version.files.map((f) => ({ ...f, harness: false })), { path: "GeneratedApp.swift", bytes: 0, harness: true }];
  }, [version]);
  const parent = version?.parent ? project.versions.find((v) => v.number === version.parent) : undefined;
  const [active, setActive] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; text: string } | null>(null);
  const current = files.find((f) => f.path === active) ?? files.find((f) => f.path === "RootView.swift") ?? files[0];
  const fileKey = current && version ? `${version.number}:${current.path}:${current.bytes}` : null;

  const relPath = current && version ? `versions/v${version.number}/xcode/GeneratedApp/${current.path}` : null;
  useEffect(() => {
    if (!relPath || !fileKey) return;
    let cancelled = false;
    api
      .text(project.id, relPath)
      .then((t) => !cancelled && setLoaded({ key: fileKey, text: t }))
      .catch(() => !cancelled && setLoaded({ key: fileKey, text: "// Could not load this file." }));
    return () => {
      cancelled = true;
    };
  }, [fileKey, relPath, project.id]);
  const loading = loaded?.key !== fileKey;
  const text = loaded?.text ?? "";

  if (!version || !files.length) {
    return <Empty icon={<FileCode2 />} title="No source yet">Muse Spark writes a multi-file SwiftUI project after the design specification.</Empty>;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="scrollbar-thin w-56 shrink-0 overflow-auto border-r p-1.5">
        {files.map((f) => {
          const prev = parent?.files.find((p) => p.path === f.path);
          const badge = f.harness ? "harness" : parent ? (!prev ? "new" : prev.bytes !== f.bytes ? "changed" : null) : null;
          return (
            <button
              key={f.path}
              onClick={() => setActive(f.path)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-mono text-[12px]",
                current?.path === f.path ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <FileCode2 className="size-3.5 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              {badge && (
                <span className={cn("text-[9px] font-sans uppercase", badge === "new" ? "text-success" : badge === "changed" ? "text-warning" : "text-muted-foreground/70")}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="relative min-w-0 flex-1">
        <button
          onClick={() => navigator.clipboard.writeText(text)}
          className="absolute top-2 right-3 z-10 flex items-center gap-1 rounded-md border bg-card/90 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-3" />
          Copy
        </button>
        <ScrollBody className={cn("h-full", loading && "opacity-60")}>
          <SwiftCode code={text} />
        </ScrollBody>
      </div>
    </div>
  );
}

const KEYWORDS = new Set(
  "import struct class enum protocol extension func var let if else guard return switch case default for in while some any private fileprivate internal public static final override mutating init self Self true false nil try await async throws where typealias associatedtype weak lazy inout".split(" "),
);

/** Tiny tokenizer-based Swift highlighter (comments, strings, attributes, keywords, types, numbers). */
function SwiftCode({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <pre className="min-w-max py-2 font-mono text-[12px] leading-[1.6]">
      {lines.map((line, i) => (
        <div key={i} className="flex hover:bg-foreground/[0.03]">
          <span className="w-12 shrink-0 pr-3 text-right text-muted-foreground/40 select-none">{i + 1}</span>
          <code className="pr-6">{highlight(line)}</code>
        </div>
      ))}
    </pre>
  );
}

function highlight(line: string) {
  const out: React.ReactNode[] = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(@\w+|#\w+)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)|(\.[a-z]\w*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [t] = m;
    let cls = "";
    if (m[1]) cls = "text-zinc-500 italic";
    else if (m[2]) cls = "text-orange-700 dark:text-orange-300";
    else if (m[3]) cls = "text-pink-600 dark:text-pink-400";
    else if (m[4]) cls = "text-violet-700 dark:text-violet-300";
    else if (m[5]) cls = KEYWORDS.has(t) ? "text-pink-600 dark:text-pink-400 font-medium" : /^[A-Z]/.test(t) ? "text-sky-700 dark:text-sky-300" : "text-foreground/90";
    else if (m[6]) cls = "text-teal-700 dark:text-teal-300";
    out.push(<span key={k++} className={cls}>{t}</span>);
    last = m.index + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : " ";
}

function LogView({ project, version, logFile, onLogFile }: { project: Project; version: Version | null; logFile: string | null; onLogFile: (f: string) => void }) {
  const attempts = version?.build?.attempts ?? [];
  const file = logFile && attempts.some((a) => a.logFile === logFile) ? logFile : attempts.at(-1)?.logFile;
  const [text, setText] = useState("");
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    api.text(project.id, file).then((t) => !cancelled && setText(t)).catch(() => !cancelled && setText("Could not load the build log."));
    return () => {
      cancelled = true;
    };
  }, [file, project.id]);

  if (!file) return <Empty icon={<ScrollText />} title="No build output yet">xcodebuild stdout and stderr are captured here for every attempt.</Empty>;

  const shown = text.length > 200_000 ? `…(truncated)\n${text.slice(-200_000)}` : text;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
        {attempts.map((a) => (
          <button
            key={a.logFile}
            onClick={() => onLogFile(a.logFile)}
            className={cn("rounded-md px-2 py-0.5 text-[11px]", a.logFile === file ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Attempt {a.attempt} · {a.status}
          </button>
        ))}
      </div>
      <ScrollBody>
        <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {shown.split("\n").map((l, i) => (
            <div key={i} className={cn(/: error:|\*\* BUILD FAILED|^error:/.test(l) && "text-destructive", /: warning:/.test(l) && "text-warning", /\*\* BUILD SUCCEEDED/.test(l) && "font-semibold text-success")}>
              {l || " "}
            </div>
          ))}
        </pre>
      </ScrollBody>
    </div>
  );
}

function HistoryView({ project, selected, onSelect }: { project: Project; selected: number | null; onSelect: (n: number) => void }) {
  const versions = [...project.versions].reverse();
  if (!versions.length) return <Empty icon={<History />} title="No versions yet" />;
  return (
    <ScrollBody className="h-full">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
          <tr className="border-b text-left">
            <th className="px-3 py-1.5 font-medium">Version</th>
            <th className="px-2 py-1.5 font-medium">Kind</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Build</th>
            <th className="px-2 py-1.5 font-medium">Score</th>
            <th className="px-2 py-1.5 font-medium">Files</th>
            <th className="px-2 py-1.5 font-medium">Models</th>
            <th className="px-2 py-1.5 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const models = [...new Set(v.modelCalls.map((c) => c.model).concat(v.segmentation ? [v.segmentation.model] : []))];
            return (
              <tr
                key={v.number}
                onClick={() => onSelect(v.number)}
                className={cn("cursor-pointer border-b border-border/60 hover:bg-accent/40", selected === v.number && "bg-primary/10")}
              >
                <td className="px-3 py-2 font-semibold">v{v.number}</td>
                <td className="px-2 py-2">
                  {v.kind === "initial" ? (
                    "generation"
                  ) : (
                    <span className="inline-flex items-center gap-1" title={v.instruction}>
                      <GitBranch className="size-3 text-muted-foreground" />
                      from v{v.parent}
                      {v.instruction ? ` · “${v.instruction.slice(0, 40)}${v.instruction.length > 40 ? "…" : ""}”` : ""}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Pill tone={v.status === "ready" ? "success" : v.status === "running" ? "info" : "danger"}>{v.status}</Pill>
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {v.build ? `${v.build.status} · ${v.build.attempts.length}× · ${formatDuration(v.build.durationMs)}` : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums">{v.critique ? Math.round(v.critique.overallScore) : "—"}</td>
                <td className="px-2 py-2 tabular-nums text-muted-foreground">{v.files.length || "—"}</td>
                <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{models.join(", ") || "—"}</td>
                <td className="px-2 py-2 text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollBody>
  );
}
