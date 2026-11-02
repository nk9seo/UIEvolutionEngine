import { describe, expect, it } from "vitest";
import { isProjectId, newProjectId, resolveInProject } from "@/lib/storage/projects";

describe("project storage paths", () => {
  it("generates valid ids and rejects others", () => {
    expect(isProjectId(newProjectId())).toBe(true);
    expect(isProjectId("../etc")).toBe(false);
    expect(isProjectId("p_ABC")).toBe(false);
  });

  it("refuses path traversal and absolute paths", () => {
    const id = newProjectId();
    expect(() => resolveInProject(id, "../other/project.json")).toThrow();
    expect(() => resolveInProject(id, "versions/../../x")).toThrow();
    expect(() => resolveInProject(id, "/etc/passwd")).toThrow();
    expect(resolveInProject(id, "versions/v1/preview.png")).toMatch(/versions\/v1\/preview\.png$/);
  });
});
