"use client";

import { ImageUp, Laptop, Loader2, Smartphone, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/schemas";
import { EXAMPLES, type Example } from "./examples";
import { ExampleCard } from "./onboarding";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

const PROMPTS: Record<Platform, string[]> = {
  macOS: [
    "Transform this interface into a premium native macOS application. Use a clean layout, subtle materials, balanced spacing, modern typography and a professional dark theme.",
    "Rebuild this as a native macOS app with a translucent sidebar, a toolbar with search, and a light, airy look.",
  ],
  iOS: [
    "Transform this into a premium native iPhone app with a tab bar, large titles, card-based content and a professional dark theme.",
    "Adapt this for iPhone: a clean light theme, generous spacing, SF Symbols and native list styling.",
  ],
};

export function NewProjectForm({
  onCreated,
  onCancel,
  example,
}: {
  onCreated: (id: string) => void;
  onCancel?: () => void;
  /** Preloads a bundled sample (the parent remounts the form with a new key per example). */
  example?: Example | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(example?.platform ?? "macOS");
  const [prompt, setPrompt] = useState(example?.prompt ?? PROMPTS.macOS[0]);
  const [constraints, setConstraints] = useState("");
  const [name, setName] = useState(example ? example.title : "");
  const [useSam, setUseSam] = useState(true);
  const [useImages, setUseImages] = useState(example?.useImageAssets ?? false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Revoke the last preview URL on unmount.
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const accept = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Use a PNG, JPEG or WebP screenshot.");
    if (f.size > MAX_BYTES) return setError("The screenshot must be 10 MB or smaller.");
    setError(null);
    setFile(f);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(f);
    setPreviewUrl(urlRef.current);
    setName((n) => n || f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60));
  }, []);

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.files ?? [])].find((f) => TYPES.includes(f.type));
      if (item) accept(item);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  const fetchExampleImage = useCallback(
    (ex: Example) =>
      fetch(ex.image)
        .then((r) => r.blob())
        .then((b) => accept(new File([b], ex.fileName, { type: "image/png" })))
        .catch(() => setError("Could not load the example image.")),
    [accept],
  );

  // Load the preset's screenshot once (state updates happen in the fetch callback).
  useEffect(() => {
    if (example) void fetchExampleImage(example);
  }, [example, fetchExampleImage]);

  const applyExample = (ex: Example) => {
    setPlatform(ex.platform);
    setPrompt(ex.prompt);
    setName(ex.title);
    setUseImages(ex.useImageAssets);
    void fetchExampleImage(ex);
  };

  const switchPlatform = (p: Platform) => {
    setPlatform(p);
    if (PROMPTS[platform].includes(prompt)) setPrompt(PROMPTS[p][0]);
  };

  const submit = async () => {
    if (!file) return setError("Add a reference screenshot first.");
    if (prompt.trim().length < 3) return setError("Describe the transformation.");
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.set("image", file);
    form.set("prompt", prompt.trim());
    form.set("platform", platform);
    form.set("constraints", constraints.trim());
    form.set("name", name.trim());
    form.set("useSegmentation", String(useSam));
    form.set("useImageAssets", String(useImages));
    try {
      const { id } = await api.create(form);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">New transformation</h2>
          <p className="text-xs text-muted-foreground">Screenshot in, compiled SwiftUI out.</p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Close">
            <X />
          </Button>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={cn(
          "group relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed bg-background/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "border-primary bg-primary/10" : "hover:border-foreground/25",
        )}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Reference screenshot" className="checker absolute inset-0 size-full object-contain" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-[11px] text-white/85">
              <span className="truncate">{file?.name}</span>
              <span>{file ? `${(file.size / 1024).toFixed(0)} KB` : ""}</span>
            </div>
          </>
        ) : (
          <>
            <ImageUp className="mb-2 size-7 text-muted-foreground/70 transition-colors group-hover:text-foreground/70" />
            <p className="text-sm font-medium">Drop a screenshot</p>
            <p className="mt-0.5 text-xs text-muted-foreground">or click to browse · paste with ⌘V</p>
            <p className="mt-2 text-[11px] text-muted-foreground/70">PNG, JPEG, WebP · up to 10 MB</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {!file && (
        <div className="-mt-2 flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">No screenshot handy? Try an example:</span>
          {EXAMPLES.map((ex) => (
            <ExampleCard key={ex.id} example={ex} compact onClick={() => applyExample(ex)} />
          ))}
        </div>
      )}

      <Field label="Target platform">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
          {(["macOS", "iOS"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPlatform(p)}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                platform === p ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "macOS" ? <Laptop className="size-3.5" /> : <Smartphone className="size-3.5" />}
              {p === "macOS" ? "macOS app" : "iOS Simulator"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Transformation request">
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="resize-none text-[13px] leading-relaxed" maxLength={4000} />
        <div className="flex flex-wrap gap-1">
          {PROMPTS[platform].map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Example {i + 1}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Design constraints" hint="optional">
        <Textarea
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          rows={2}
          placeholder="e.g. keep the brand blue #2A6BE0, WCAG AA contrast, no gradients"
          className="resize-none text-[13px]"
          maxLength={4000}
        />
      </Field>

      <Field label="Project name" hint="optional">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Untitled"
          className="h-8 rounded-md border border-input bg-transparent px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-2.5">
        <Switch checked={useSam} onCheckedChange={setUseSam} className="mt-0.5" />
        <span className="text-xs leading-relaxed">
          <span className="font-medium text-foreground">SAM 3.1 segmentation</span>
          <span className="block text-muted-foreground">Measure buttons, fields, cards and icons with pixel masks before Muse Spark reads the layout.</span>
        </span>
      </label>

      <label className="-mt-2 flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-2.5">
        <Switch checked={useImages} onCheckedChange={setUseImages} className="mt-0.5" />
        <span className="text-xs leading-relaxed">
          <span className="font-medium text-foreground">Muse Image assets</span>
          <span className="block text-muted-foreground">Let the spec request up to two original decorative images (hero, background) that are generated and bundled into the app.</span>
        </span>
      </label>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}

      <Button size="lg" onClick={submit} disabled={submitting || !file} className="h-10 font-semibold">
        {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {submitting ? "Starting…" : "Start transformation"}
      </Button>
      <p className="-mt-2 text-center text-[11px] text-muted-foreground">Usually 2–4 minutes. Watch every step in the Agent tab.</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-foreground/90">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
