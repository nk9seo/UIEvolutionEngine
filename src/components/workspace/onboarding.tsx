"use client";

import { ArrowRight, Check, Hammer, ImageUp, Info, ScanEye, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SystemStatus } from "@/lib/types";
import { EXAMPLES, type Example } from "./examples";
import { Logo } from "./primitives";

export const ONBOARDED_KEY = "uiee.onboarded";

const STEPS = [
  { icon: ImageUp, title: "Drop a screenshot", text: "Any app, website or design, plus one sentence on what you want." },
  { icon: Sparkles, title: "The agent builds it", text: "SAM 3.1 and Muse Spark analyze, specify and write SwiftUI; Xcode compiles it. About 2–4 minutes." },
  { icon: ScanEye, title: "See the real app", text: "It runs in the iOS Simulator or on your Mac, next to your reference, with a scored review." },
  { icon: Wand2, title: "Improve, then ship", text: "Pick issues or type a change for a new version. Open the project in Xcode or download it." },
];

export function Onboarding({
  open,
  onOpenChange,
  status,
  onTryExample,
  onStartOwn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SystemStatus | null;
  onTryExample: (example: Example) => void;
  onStartOwn: () => void;
}) {
  const checks: Array<{ ok: boolean | undefined; label: string; ok_text: string; fix: string; optional?: boolean }> = [
    {
      ok: status?.metaApiKey,
      label: "Meta Model API key",
      ok_text: "Configured on the server",
      fix: "Add MODEL_API_KEY to .env.local and restart npm run dev.",
    },
    {
      ok: status?.xcode.available,
      label: "Xcode",
      ok_text: status?.xcode.version ?? "Available",
      fix: "Install Xcode from the App Store, then run: sudo xcode-select -s /Applications/Xcode.app",
    },
    {
      ok: status?.simulator.available,
      label: "iOS Simulator",
      ok_text: status?.simulator.name ? `${status.simulator.name} (${status.simulator.state})` : "Available",
      fix: "Add an iPhone simulator in Xcode → Settings → Components. macOS targets work without one.",
      optional: true,
    },
  ];
  const ready = !!status?.metaApiKey && !!status?.xcode.available;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl" showCloseButton={false}>
        <div className="relative border-b bg-gradient-to-br from-primary/15 via-transparent to-transparent p-6">
          <button onClick={() => onOpenChange(false)} className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
          <Logo className="mb-2 -ml-1 size-14" />
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl tracking-tight">Welcome to UI Evolution Engine</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Turn a screenshot into a compiled, running native SwiftUI app, then let the agent review and improve it. Every step is a real Meta model call and a real Xcode build.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid gap-6 p-6">
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Your setup</p>
            <ul className="divide-y rounded-xl border">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                      c.ok === undefined ? "bg-muted" : c.ok ? "bg-success/15 text-success" : c.optional ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {c.ok ? <Check className="size-3" /> : c.ok === false ? <X className="size-3" /> : null}
                  </span>
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-foreground">{c.label}</p>
                    <p className="text-muted-foreground">{c.ok === undefined ? "Checking…" : c.ok ? c.ok_text : c.fix}</p>
                  </div>
                </li>
              ))}
              <li className="flex items-start gap-3 px-3 py-2.5">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="text-xs">
                  <p className="font-medium text-foreground">Mac window capture</p>
                  <p className="text-muted-foreground">
                    For pixel-exact macOS previews, allow your terminal under System Settings → Privacy &amp; Security → Screen Recording. Without it, the app renders its own window instead.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Try an example</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLES.map((ex) => (
                <ExampleCard key={ex.id} example={ex} disabled={!ready} onClick={() => onTryExample(ex)} />
              ))}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Explore first
            </Button>
            <Button onClick={onStartOwn} disabled={!ready}>
              <Hammer />
              Use my own screenshot
              <ArrowRight />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExampleCard({ example, onClick, disabled, compact }: { example: Example; onClick: () => void; disabled?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-xl border bg-card p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={example.image} alt="" className={cn("shrink-0 rounded-md border object-cover object-left-top", compact ? "h-10 w-16" : "h-14 w-24")} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium">{example.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{example.subtitle}</p>
      </div>
      <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}
