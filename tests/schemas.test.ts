import { describe, expect, it } from "vitest";
import { CodegenResult, Critique, SpecAndPlan, UIAnalysis, toModelSchema } from "@/lib/schemas";

function depth(v: unknown): number {
  if (v === null || typeof v !== "object") return 0;
  return 1 + Math.max(0, ...Object.values(v as Record<string, unknown>).map(depth));
}

describe("model schemas", () => {
  it("convert to JSON Schema without $schema or recursion", () => {
    for (const s of [UIAnalysis, SpecAndPlan, CodegenResult, Critique]) {
      const json = toModelSchema(s);
      expect(json.$schema).toBeUndefined();
      expect(json.type).toBe("object");
      expect(JSON.stringify(json)).not.toContain('"$ref"');
      // Meta Model API limit: nesting depth 10 (counted on schema keywords, roughly half of this object depth).
      expect(depth(json)).toBeLessThan(22);
    }
  });

  it("rejects unsafe generated file paths", () => {
    const ok = { files: [{ path: "Views/Sidebar.swift", contents: "x" }], notes: [] };
    expect(CodegenResult.safeParse(ok).success).toBe(true);
    for (const path of ["../Evil.swift", "/tmp/x.swift", "Views/../../x.swift", "script.sh", "lower.swift", "Other/Deep.swift"]) {
      expect(CodegenResult.safeParse({ files: [{ path, contents: "x" }], notes: [] }).success).toBe(false);
    }
  });
});
