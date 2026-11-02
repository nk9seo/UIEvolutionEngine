"use client";

import { Activity, Bot, ChevronDown, CircleHelp, FileJson2, Hammer, Plus } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, useProject } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { ProjectSummary, SystemStatus } from "@/lib/types";
import { BottomPanel } from "./bottom";
import { BuildView } from "./build-view";
import { EXAMPLES, type Example } from "./examples";
import { NewProjectForm } from "./new-project";
import { ExampleCard, Onboarding, ONBOARDED_KEY } from "./onboarding";
import { Pipeline } from "./pipeline";
import { Empty, Logo, Panel, PanelHeader, ScrollBody } from "./primitives";
import { ProjectInfo } from "./project-info";
import { Review } from "./review";
import { SpecView } from "./spec-view";
import { Viewer } from "./viewer";

type RightTab = "agent" | "spec" | "build" | "review";

// First-visit flag in localStorage, read as an external store (server snapshot: already onboarded).
const ONBOARD_EVENT = "uiee-onboarded";
function readOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return true;
  }
}
function subscribeOnboarded(cb: () => void) {
  window.addEventListener(ONBOARD_EVENT, cb);
  return () => window.removeEventListener(ONBOARD_EVENT, cb);
}
function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // Storage blocked: the welcome simply shows again next visit.
  }
  window.dispatchEvent(new Event(ONBOARD_EVENT));
}
type BottomTab = "source" | "log" | "history";

export function Workspace({ initialProjectId }: { initialProjectId: string | null }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [creating, setCreating] = useState(initialProjectId === null);
  // A version the user picked; it stays selected until a newer version appears.
  const [pinned, setPinned] = useState<{ number: number; count: number } | null>(null);
  // null = automatic: Agent while a job runs, otherwise Review (or Build when it failed).
  const [rightTabChoice, setRightTab] = useState<RightTab | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("source");
  const [logFile, setLogFile] = useState<string | null>(null);
  const [example, setExample] = useState<{ key: number; example: Example } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const onboarded = useSyncExternalStore(subscribeOnboarded, readOnboarded, () => true);
  const welcomeOpen = helpOpen || !onboarded;

  const refreshProjects = useCallback(() => api.projects().then((r) => setProjects(r.projects)).catch(() => undefined), []);

  const { project, reload } = useProject(projectId, (prev, next) => {
    if (prev && next.versions.length > prev.versions.length) setRightTab(null);
    if (prev?.job?.status === "running" && next.job?.status !== "running") {
      void refreshProjects();
      setRightTab(null);
    }
  });

  useEffect(() => {
    let cancelled = false;
    api.status().then((s) => !cancelled && setStatus(s)).catch(() => undefined);
    api.projects().then((r) => !cancelled && setProjects(r.projects)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selectProject = useCallback((id: string | null) => {
    setProjectId(id);
    setCreating(id === null);
    setPinned(null);
    setRightTab(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("p", id);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url);
  }, []);

  const closeWelcome = () => {
    markOnboarded();
    setHelpOpen(false);
  };
  const tryExample = (ex: Example) => {
    closeWelcome();
    selectProject(null);
    setExample({ key: Date.now(), example: ex });
  };

  const versions = project?.versions ?? [];
  const versionNo = pinned && pinned.count === versions.length ? pinned.number : (versions.at(-1)?.number ?? null);
  const setVersionNo = (n: number) => setPinned({ number: n, count: versions.length });
  const version = versions.find((v) => v.number === versionNo) ?? null;
  const jobOnVersion = project?.job?.status === "running" && project.job.versionNumber === version?.number;
  const rightTab: RightTab =
    rightTabChoice ?? (jobOnVersion ? "agent" : version?.critique ? "review" : version?.build?.status === "failed" ? "build" : "agent");

  return (
    <div className="flex h-full flex-col overflow-auto xl:overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/60 px-3 backdrop-blur-xl sm:px-4">
        <div className="flex items-center gap-2">
          <Logo className="size-8" />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-semibold tracking-tight whitespace-nowrap">UI Evolution Engine</p>
            <p className="hidden text-[10px] whitespace-nowrap text-muted-foreground lg:block">Screenshot → native SwiftUI · powered by Meta Muse Spark &amp; SAM 3.1</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:ml-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 max-w-64 gap-1.5 text-xs">
                <span className="truncate">{project?.name ?? (creating ? "New project" : "Select project")}</span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs">Projects</DropdownMenuLabel>
              {projects.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet</p>}
              {projects.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => selectProject(p.id)} className="flex items-center gap-2 text-xs">
                  <span className={cn("size-1.5 rounded-full", p.status === "running" ? "bg-primary" : p.status === "failed" ? "bg-destructive" : "bg-success")} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-muted-foreground">{p.platform} · v{p.versions}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => selectProject(null)} className="text-xs">
                <Plus className="size-3.5" />
                New transformation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!creating && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectProject(null)}>
              <Plus />
              New
            </Button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="How it works" onClick={() => setHelpOpen(true)}>
                <CircleHelp />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">How it works &amp; setup check</TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </div>
        <div className="hidden items-center gap-1.5 lg:flex">
          <StatusChip ok={status?.metaApiKey} label="Meta Model API" detail={status ? (status.metaApiKey ? "MODEL_API_KEY configured on the server (never sent to the browser)" : "MODEL_API_KEY missing — add it to .env.local") : "Checking…"} />
          <StatusChip ok={status?.xcode.available} label={status?.xcode.version ?? "Xcode"} detail={status?.xcode.available ? "xcodebuild available" : "xcodebuild not found"} />
          <StatusChip
            ok={status?.simulator.available}
            label={status?.simulator.name ?? "Simulator"}
            detail={status?.simulator.available ? `${status.simulator.state} · ${status.simulator.udid}` : "No iOS simulator available — iOS previews will be reported as unavailable"}
          />
        </div>
      </header>

      <main className="grid flex-1 gap-2 p-2 xl:min-h-0 xl:grid-cols-[320px_minmax(0,1fr)_400px] xl:grid-rows-[minmax(0,1fr)_minmax(0,38%)]">
        {/* LEFT: project, reference, prompt, platform, generate */}
        <Panel className="xl:row-span-2">
          <PanelHeader title={creating ? "Reference" : "Project"} icon={<FileJson2 />} />
          <ScrollBody>
            {creating || !project ? (
              creating ? (
                <NewProjectForm
                  key={example?.key ?? "blank"}
                  example={example?.example}
                  onCreated={(id) => {
                    selectProject(id);
                    void refreshProjects();
                  }}
                  onCancel={projectId ? () => setCreating(false) : undefined}
                />
              ) : (
                <Empty title="Loading project…" />
              )
            ) : (
              <ProjectInfo project={project} version={version} onChanged={reload} />
            )}
          </ScrollBody>
        </Panel>

        {/* CENTER: reference vs native */}
        <div className="min-h-[420px] min-w-0 xl:min-h-0">
          {project && !creating ? (
            <Viewer project={project} version={version} onChanged={reload} />
          ) : (
            <Panel className="h-full">
              <PanelHeader title="Canvas" />
              <Hero onTryExample={tryExample} />
            </Panel>
          )}
        </div>

        {/* RIGHT: reasoning, spec, build, improvements */}
        <Panel className="min-h-[480px] xl:row-span-2 xl:min-h-0">
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as RightTab)} className="flex min-h-0 flex-1 flex-col gap-0">
            <PanelHeader title="Inspector" icon={<Activity />}>
              <TabsList className="h-7">
                <TabsTrigger value="agent" className="text-xs"><Bot />Agent</TabsTrigger>
                <TabsTrigger value="spec" className="text-xs">Spec</TabsTrigger>
                <TabsTrigger value="build" className="text-xs"><Hammer />Build</TabsTrigger>
                <TabsTrigger value="review" className="text-xs">Review</TabsTrigger>
              </TabsList>
            </PanelHeader>
            {project && !creating ? (
              <>
                <TabsContent value="agent" className="min-h-0 flex-1"><ScrollBody className="h-full"><Pipeline job={project.job} version={version} /></ScrollBody></TabsContent>
                <TabsContent value="spec" className="min-h-0 flex-1"><ScrollBody className="h-full"><SpecView projectId={project.id} spec={version?.spec} plan={version?.plan} analysis={version?.analysis} assets={version?.assets} /></ScrollBody></TabsContent>
                <TabsContent value="build" className="min-h-0 flex-1">
                  <ScrollBody className="h-full">
                    <BuildView
                      version={version}
                      onOpenLog={(f) => {
                        setLogFile(f);
                        setBottomTab("log");
                      }}
                    />
                  </ScrollBody>
                </TabsContent>
                <TabsContent value="review" className="min-h-0 flex-1"><ScrollBody className="h-full"><Review key={`${version?.number}-${version?.critique ? "c" : "n"}`} project={project} version={version} onStarted={reload} /></ScrollBody></TabsContent>
              </>
            ) : (
              <Empty icon={<Bot />} title="The agent is idle">Upload a screenshot and describe the transformation to start.</Empty>
            )}
          </Tabs>
        </Panel>

        {/* BOTTOM: source, build output, iteration history */}
        <div className="min-h-[360px] min-w-0 xl:min-h-0">
          {project && !creating ? (
            <BottomPanel
              project={project}
              version={version}
              onSelectVersion={setVersionNo}
              tab={bottomTab}
              onTab={setBottomTab}
              logFile={logFile}
              onLogFile={setLogFile}
            />
          ) : (
            <Panel className="h-full">
              <PanelHeader title="Output" />
              <Empty title="SwiftUI source, build output and iteration history appear here" />
            </Panel>
          )}
        </div>
      </main>

      <Onboarding
        open={welcomeOpen}
        onOpenChange={(o) => (o ? setHelpOpen(true) : closeWelcome())}
        status={status}
        onTryExample={tryExample}
        onStartOwn={() => {
          closeWelcome();
          selectProject(null);
        }}
      />
    </div>
  );
}

function StatusChip({ ok, label, detail }: { ok: boolean | undefined; label: string; detail: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-card/60 px-2 text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", ok === undefined ? "bg-muted-foreground/40" : ok ? "bg-success" : "bg-destructive")} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{detail}</TooltipContent>
    </Tooltip>
  );
}

const STEPS = [
  ["Understand", "Muse Spark reads the screenshot; SAM 3.1 measures UI regions with pixel masks."],
  ["Specify", "A validated design spec and implementation plan for native macOS or iOS."],
  ["Generate", "A multi-file SwiftUI project — real Swift, not HTML."],
  ["Compile", "xcodebuild in an isolated project; compiler errors go back to Muse Spark."],
  ["Run", "Launched in the iOS Simulator or as a sandboxed Mac app and captured."],
  ["Improve", "Muse Spark compares the render with the reference and iterates on request."],
];

function Hero({ onTryExample }: { onTryExample: (ex: Example) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-lg text-center">
        <h1 className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
          From screenshot to a compiled native app.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          An autonomous interface-engineering agent built on Meta&apos;s models. Every result shown here is produced by real model calls and a real Xcode build.
        </p>
      </div>
      <ol className="grid w-full max-w-2xl grid-cols-2 gap-2 lg:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] font-semibold text-primary tabular-nums">0{i + 1}</p>
            <p className="mt-0.5 text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
      <div className="w-full max-w-2xl">
        <p className="mb-2 text-center text-xs text-muted-foreground">New here? Run a sample end to end:</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <ExampleCard key={ex.id} example={ex} onClick={() => onTryExample(ex)} />
          ))}
        </div>
      </div>
    </div>
  );
}
