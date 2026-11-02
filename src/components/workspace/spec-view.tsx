"use client";

import { assetUrl } from "@/lib/client";
import type { DesignSpec, ImplementationPlan, UIAnalysis } from "@/lib/schemas";
import type { ImageAsset } from "@/lib/types";
import { Empty, Pill, SectionTitle } from "./primitives";

export function SpecView({
  projectId,
  spec,
  plan,
  analysis,
  assets,
}: {
  projectId: string;
  spec?: DesignSpec;
  plan?: ImplementationPlan;
  analysis?: UIAnalysis;
  assets?: ImageAsset[];
}) {
  if (!spec) {
    return (
      <div className="p-3">
        {analysis ? <AnalysisSummary analysis={analysis} /> : <Empty title="No specification yet">Muse Spark writes the design specification after analyzing the screenshot.</Empty>}
      </div>
    );
  }
  const byParent = new Map<string | null, DesignSpec["components"]>();
  for (const c of spec.components) {
    const key = c.parentId && spec.components.some((x) => x.id === c.parentId) ? c.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const renderTree = (parent: string | null, depth: number): React.ReactNode =>
    (byParent.get(parent) ?? []).map((c) => (
      <div key={c.id}>
        <div className="flex items-baseline gap-2 py-0.5" style={{ paddingLeft: depth * 14 }}>
          <span className="font-mono text-[12px] text-primary">{c.name}</span>
          <span className="text-[11px] text-muted-foreground">{c.type} · {c.position}{c.width ? ` · ${c.width}pt` : ""}</span>
        </div>
        {depth < 6 && renderTree(c.id, depth + 1)}
      </div>
    ));

  return (
    <div className="flex flex-col gap-5 p-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Fact label="App" value={spec.appName} />
        <Fact label="Platform" value={`${spec.platform} · ${spec.appearance}`} />
        <Fact label="Layout" value={spec.layout} />
        <Fact label="Window" value={`${spec.window.width}×${spec.window.height} pt`} />
        <Fact label="Navigation" value={`${spec.navigation.style} · ${spec.navigation.items.length} items`} />
        <Fact label="Components" value={String(spec.components.length)} />
      </div>

      <div>
        <SectionTitle>Color tokens</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {spec.colorTokens.map((c) => (
            <div key={c.token} className="flex items-center gap-2 rounded-md border bg-muted/20 p-1.5">
              <span className="size-6 shrink-0 rounded-md ring-1 ring-foreground/15" style={{ background: c.hex }} />
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px]">{c.token}</p>
                <p className="truncate text-[10px] text-muted-foreground">{c.hex} · {c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Typography</SectionTitle>
        <div className="flex flex-col gap-1">
          {spec.typography.map((t) => (
            <div key={t.token} className="flex items-baseline gap-2 text-xs">
              <span className="w-24 shrink-0 truncate font-medium">{t.token}</span>
              <code className="truncate font-mono text-[11px] text-primary">{t.swiftUIFont}</code>
              <span className="ml-auto truncate text-[11px] text-muted-foreground">{t.usage}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(spec.spacing).map(([k, v]) => (
            <Pill key={k}>space.{k} {v}</Pill>
          ))}
          {Object.entries(spec.cornerRadius).map(([k, v]) => (
            <Pill key={k}>radius.{k} {v}</Pill>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Component tree</SectionTitle>
        <div className="rounded-lg border bg-muted/20 p-2">{renderTree(null, 0)}</div>
      </div>

      {assets && assets.length > 0 && (
        <div>
          <SectionTitle aside={<Pill>muse-image-1.0</Pill>}>Generated image assets</SectionTitle>
          <div className="flex flex-col gap-2">
            {assets.map((a) => (
              <div key={a.name} className="flex gap-2.5 rounded-lg border bg-muted/20 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(projectId, a.file)} alt={a.name} className="h-16 w-24 shrink-0 rounded-md object-cover ring-1 ring-foreground/10" />
                <div className="min-w-0 text-xs">
                  <p className="font-mono text-[12px] text-primary">GeneratedAsset.image(&quot;{a.name}&quot;)</p>
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground">{a.usage}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">{a.width}×{a.height} · {(a.durationMs / 1000).toFixed(1)}s</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div>
          <SectionTitle>Implementation plan</SectionTitle>
          <div className="flex flex-col gap-1">
            {plan.files.map((f) => (
              <div key={f.path} className="text-xs">
                <span className="font-mono text-[12px]">{f.path}</span>
                <span className="text-muted-foreground"> — {f.purpose}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <List title="Design principles" items={spec.designPrinciples} />
      <List title="Changes from reference" items={spec.changesFromReference} />
      <List title="Accessibility" items={spec.accessibility} />
      {analysis && <AnalysisSummary analysis={analysis} />}
    </div>
  );
}

function AnalysisSummary({ analysis }: { analysis: UIAnalysis }) {
  return (
    <div>
      <SectionTitle aside={<Pill>{analysis.regions.length} regions · {analysis.elements.length} elements</Pill>}>Reference analysis</SectionTitle>
      <p className="text-[13px] leading-relaxed text-foreground/85">{analysis.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Pill>{analysis.layoutPattern}</Pill>
        <Pill>{analysis.appearance}</Pill>
        <Pill>{analysis.screen.deviceClass} · {analysis.screen.widthPx}×{analysis.screen.heightPx}</Pill>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {analysis.colors.map((c) => (
          <span key={c.name + c.hex} title={`${c.name} · ${c.usage}`} className="size-5 rounded ring-1 ring-foreground/15" style={{ background: c.hex }} />
        ))}
      </div>
      {analysis.observedIssues.length > 0 && <List title="Weaknesses in the reference" items={analysis.observedIssues} className="mt-3" />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="truncate text-[13px] font-medium" title={value}>{value}</p>
    </div>
  );
}

function List({ title, items, className }: { title: string; items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={className}>
      <SectionTitle>{title}</SectionTitle>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed text-foreground/85 marker:text-muted-foreground">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
