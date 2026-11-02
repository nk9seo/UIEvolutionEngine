"use client";

import { AlertTriangle, Check, CircleDashed, Loader2, MinusCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/lib/types";

/** The app mark (public/logo.png, also the favicon via src/app/icon.png). */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="" aria-hidden width={256} height={256} draggable={false} className={cn("shrink-0 select-none", className)} />;
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card/70 shadow-[0_1px_0_0_oklch(1_0_0/4%)_inset] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({ title, icon, children }: { title: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      {icon && <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="scrollbar-thin ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto">{children}</div>
    </header>
  );
}

export function Empty({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center", className)}>
      {icon && <div className="text-muted-foreground/60 [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {children && <div className="max-w-sm text-xs leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  );
}

export function StepIcon({ status, className }: { status: StepStatus; className?: string }) {
  const base = cn("size-4 shrink-0", className);
  switch (status) {
    case "running":
      return <Loader2 className={cn(base, "animate-spin text-primary")} />;
    case "done":
      return <Check className={cn(base, "text-success")} />;
    case "failed":
      return <X className={cn(base, "text-destructive")} />;
    case "skipped":
      return <MinusCircle className={cn(base, "text-muted-foreground/60")} />;
    default:
      return <CircleDashed className={cn(base, "text-muted-foreground/40")} />;
  }
}

export function Pill({ tone = "neutral", children, className }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "border-border bg-muted/60 text-muted-foreground",
    success: "border-success/25 bg-success/10 text-success",
    warning: "border-warning/25 bg-warning/10 text-warning",
    danger: "border-destructive/25 bg-destructive/10 text-destructive",
    info: "border-primary/25 bg-primary/10 text-primary",
  };
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3", tones[tone], className)}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-warning/25 bg-warning/5 p-2.5 text-xs text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function ScrollBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-auto", className)}>{children}</div>;
}
