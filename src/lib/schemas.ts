import { z } from "zod";

/**
 * Typed contracts for every structured model output. The same Zod schemas are
 * converted to JSON Schema for Meta's `text.format` (constrained decoding) and
 * then used to validate the result. No recursive types: the API rejects them,
 * so hierarchies are flattened with parent IDs.
 */

export const Platform = z.enum(["iOS", "macOS"]);
export type Platform = z.infer<typeof Platform>;

/** [x_min, y_min, x_max, y_max] on Muse Spark's normalized 0–1000 grid. */
const Box = z.array(z.number().min(0).max(1000)).length(4).describe("[x_min, y_min, x_max, y_max] on a 0-1000 grid, (0,0) top-left");
const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).describe("#RRGGBB");

// ---------- Step 2: visual understanding ----------

export const ElementType = z.enum([
  "button", "text", "heading", "icon", "image", "card", "list", "listItem", "textField",
  "searchField", "toggle", "segmentedControl", "tab", "navItem", "badge", "avatar", "chart",
  "divider", "table", "progress", "menu", "other",
]);

export const UIAnalysis = z.object({
  summary: z.string().describe("Two or three sentences: what this screen is and how it is organized"),
  appCategory: z.string(),
  screen: z.object({
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    deviceClass: z.enum(["phone", "tablet", "desktop", "web", "unknown"]),
    orientation: z.enum(["portrait", "landscape"]),
  }),
  appearance: z.enum(["light", "dark", "mixed"]),
  layoutPattern: z.string().describe("e.g. 'sidebar + main content', 'tab bar + scrolling list'"),
  regions: z.array(z.object({
    id: z.string(),
    role: z.enum(["header", "toolbar", "sidebar", "navigation", "content", "footer", "tabBar", "panel", "modal", "other"]),
    label: z.string(),
    box: Box,
    description: z.string(),
  })).max(16),
  elements: z.array(z.object({
    id: z.string(),
    type: ElementType,
    label: z.string().describe("Visible text, or a short description for non-text elements"),
    regionId: z.string(),
    box: Box,
    emphasis: z.enum(["primary", "secondary", "tertiary"]),
  })).max(80),
  colors: z.array(z.object({ name: z.string(), hex: Hex, usage: z.string() })).max(14),
  typography: z.array(z.object({
    role: z.string().describe("e.g. largeTitle, title, headline, body, caption"),
    approxSizePx: z.number(),
    weight: z.enum(["regular", "medium", "semibold", "bold", "heavy", "light"]),
    sample: z.string(),
  })).max(10),
  spacing: z.object({
    baseUnitPx: z.number(),
    containerPaddingPx: z.number(),
    itemGapPx: z.number(),
    cornerRadiusPx: z.number(),
  }),
  hierarchy: z.array(z.string()).max(12).describe("Elements/regions from most to least visually prominent"),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    relation: z.enum(["contains", "above", "below", "leftOf", "rightOf", "alignedWith", "groupedWith"]),
  })).max(40),
  observedIssues: z.array(z.string()).max(10).describe("Visual/UX weaknesses in the reference worth fixing"),
});
export type UIAnalysis = z.infer<typeof UIAnalysis>;

// ---------- Step 3: design specification + implementation plan ----------

export const SwiftFileName = z
  .string()
  .regex(/^(?:(?:Views|Components|Models|Theme|Support)\/)?[A-Z][A-Za-z0-9]{0,60}\.swift$/, "File must be Name.swift, optionally in Views/, Components/, Models/, Theme/ or Support/");

export const DesignSpec = z.object({
  appName: z.string().max(40),
  platform: Platform,
  appearance: z.enum(["light", "dark"]),
  layout: z.string().describe("e.g. 'sidebar + main content'"),
  window: z.object({ width: z.number().int().min(320).max(1800), height: z.number().int().min(400).max(1200) })
    .describe("Target window size in points (macOS) or nominal screen size (iOS)"),
  navigation: z.object({
    style: z.enum(["sidebar", "tabBar", "navigationStack", "splitView", "single"]),
    items: z.array(z.object({ title: z.string(), systemImage: z.string().describe("SF Symbol name") })).max(10),
  }),
  colorTokens: z.array(z.object({ token: z.string(), hex: Hex, role: z.string() })).max(16),
  typography: z.array(z.object({
    token: z.string(),
    swiftUIFont: z.string().describe("SwiftUI font expression, e.g. .title2.weight(.semibold)"),
    usage: z.string(),
  })).max(10),
  spacing: z.object({ xs: z.number(), s: z.number(), m: z.number(), l: z.number(), xl: z.number() }),
  cornerRadius: z.object({ small: z.number(), medium: z.number(), large: z.number() }),
  components: z.array(z.object({
    id: z.string(),
    name: z.string().describe("SwiftUI view type name"),
    type: z.string(),
    parentId: z.string().nullable(),
    position: z.string().describe("leading, trailing, top, center, bottom, inline..."),
    width: z.number().nullable(),
    height: z.number().nullable(),
    description: z.string(),
    content: z.array(z.string()).max(20).describe("Texts, data rows or children shown"),
  })).min(1).max(40),
  designPrinciples: z.array(z.string()).max(10),
  accessibility: z.array(z.string()).max(8),
  changesFromReference: z.array(z.string()).max(12),
  imageAssets: z.array(z.object({
    name: z.string().regex(/^[a-z][A-Za-z0-9]{1,30}$/).describe("lowerCamelCase resource name"),
    prompt: z.string().max(600).describe("Description of an original decorative image (no text, no logos, no UI)"),
    usage: z.string().describe("Where and how the view shows it"),
    aspect: z.enum(["square", "landscape", "portrait"]),
  })).max(2).describe("Decorative raster images for Muse Image to generate; empty when not useful or not enabled"),
});
export type DesignSpec = z.infer<typeof DesignSpec>;

export const ImplementationPlan = z.object({
  files: z.array(z.object({
    path: SwiftFileName,
    purpose: z.string(),
    views: z.array(z.string()),
  })).min(2).max(16),
  steps: z.array(z.string()).max(12),
  risks: z.array(z.string()).max(8),
});
export type ImplementationPlan = z.infer<typeof ImplementationPlan>;

export const SpecAndPlan = z.object({
  rationale: z.string().describe("Short explanation of the main design decisions"),
  spec: DesignSpec,
  plan: ImplementationPlan,
});
export type SpecAndPlan = z.infer<typeof SpecAndPlan>;

// ---------- Step 4: SwiftUI source ----------

export const GeneratedFile = z.object({
  path: SwiftFileName,
  contents: z.string().min(1).max(120_000),
});
export type GeneratedFile = z.infer<typeof GeneratedFile>;

export const CodegenResult = z.object({
  files: z.array(GeneratedFile).min(1).max(24),
  notes: z.array(z.string()).max(10),
});
export type CodegenResult = z.infer<typeof CodegenResult>;

export const RepairResult = z.object({
  diagnosis: z.string(),
  files: z.array(GeneratedFile).min(1).max(24).describe("Complete new contents of every file that changes"),
});
export type RepairResult = z.infer<typeof RepairResult>;

// ---------- Step 7: visual comparison ----------

export const IssueCategory = z.enum([
  "layout", "spacing", "typography", "color", "missingElement", "hierarchy", "clipping",
  "proportion", "platform", "accessibility",
]);

export const Critique = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  scores: z.object({
    layout: z.number().min(0).max(10),
    spacing: z.number().min(0).max(10),
    typography: z.number().min(0).max(10),
    color: z.number().min(0).max(10),
    hierarchy: z.number().min(0).max(10),
    completeness: z.number().min(0).max(10),
    platformFidelity: z.number().min(0).max(10),
  }),
  issues: z.array(z.object({
    id: z.string(),
    priority: z.number().int().min(1).max(20).describe("1 = fix first"),
    severity: z.enum(["high", "medium", "low"]),
    category: IssueCategory,
    title: z.string(),
    detail: z.string(),
    suggestedFix: z.string().describe("Concrete SwiftUI-level change"),
  })).max(12),
  strengths: z.array(z.string()).max(6),
});
export type Critique = z.infer<typeof Critique>;

/** JSON Schema for Meta `text.format`, derived from a Zod schema. */
export function toModelSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
