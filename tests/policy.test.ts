import { describe, expect, it } from "vitest";
import { checkSourcePolicy } from "@/lib/xcode/policy";

const root = { path: "RootView.swift", contents: "import SwiftUI\n\nstruct RootView: View {\n    var body: some View { Text(\"Hi\").font(.system(size: 14)) }\n}\n" };

describe("source policy", () => {
  it("accepts plain SwiftUI with Font.system", () => {
    expect(checkSourcePolicy([root], "iOS")).toEqual([]);
  });

  it("requires RootView", () => {
    const d = checkSourcePolicy([{ path: "Views/Other.swift", contents: "import SwiftUI\nstruct Other: View { var body: some View { EmptyView() } }" }], "macOS");
    expect(d.some((x) => x.message.includes("RootView"))).toBe(true);
  });

  it("rejects @main, process spawning, file system, network and pasteboard", () => {
    const bad = [
      root,
      { path: "Support/Evil.swift", contents: "import Foundation\n@main struct X {}\nlet p = Process()\nlet f = FileManager.default\nlet s = URLSession.shared\nlet pb = UIPasteboard.general\n" },
    ];
    const msgs = checkSourcePolicy(bad, "iOS").map((d) => d.message).join("\n");
    expect(msgs).toMatch(/@main/);
    expect(msgs).toMatch(/spawning processes/);
    expect(msgs).toMatch(/file system/);
    expect(msgs).toMatch(/network/);
    expect(msgs).toMatch(/pasteboard/);
  });

  it("enforces the import allowlist per platform", () => {
    const files = [{ ...root, contents: "import AppKit\nimport Network\n" + root.contents }];
    const msgs = checkSourcePolicy(files, "iOS").map((d) => d.message);
    expect(msgs.some((m) => m.includes("import AppKit"))).toBe(true);
    expect(msgs.some((m) => m.includes("import Network"))).toBe(true);
    expect(checkSourcePolicy([{ ...root, contents: "import AppKit\n" + root.contents }], "macOS")).toEqual([]);
  });

  it("ignores forbidden words inside comments and strings", () => {
    const files = [{ ...root, contents: root.contents + '// uses Process() in docs\nlet label = "FileManager and URLSession"\n' }];
    expect(checkSourcePolicy(files, "iOS")).toEqual([]);
  });

  it("reports line numbers", () => {
    const d = checkSourcePolicy([{ ...root, contents: root.contents + "\nlet x = Process()\n" }], "macOS");
    expect(d[0].line).toBe(7);
  });
});
