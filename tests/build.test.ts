import { describe, expect, it } from "vitest";
import { parseDiagnostics } from "@/lib/xcode/build";
import { renderAppEntry, renderPbxproj } from "@/lib/xcode/template";

const root = "/data/projects/p_abc123/versions/v1/xcode/GeneratedApp";

describe("xcodebuild diagnostics", () => {
  it("parses, relativizes and de-duplicates compiler errors", () => {
    const log = [
      `${root}/Views/Sidebar.swift:12:5: error: cannot find 'Foo' in scope`,
      `${root}/Views/Sidebar.swift:12:5: error: cannot find 'Foo' in scope`,
      `${root}/RootView.swift:3:1: warning: unused variable`,
      "** BUILD FAILED **",
    ].join("\n");
    const d = parseDiagnostics(log, root);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ file: "Views/Sidebar.swift", line: 12, column: 5, severity: "error" });
    expect(d[1].severity).toBe("warning");
  });

  it("falls back to general errors when no file diagnostics exist", () => {
    const d = parseDiagnostics("xcodebuild: error: Unable to find a destination", root);
    expect(d[0]).toMatchObject({ file: "", severity: "error" });
  });
});

describe("Xcode project template", () => {
  it("uses a synchronized folder group and per-platform SDK", () => {
    const ios = renderPbxproj({ platform: "iOS", bundleId: "dev.uiee.generated.x", displayName: "My App" });
    expect(ios).toContain("PBXFileSystemSynchronizedRootGroup");
    expect(ios).toContain("SDKROOT = iphoneos;");
    expect(ios).toContain('INFOPLIST_KEY_CFBundleDisplayName = "My App";');
    const mac = renderPbxproj({ platform: "macOS", bundleId: "dev.uiee.generated.x", displayName: "App" });
    expect(mac).toContain("SDKROOT = macosx;");
    expect(mac).toContain("ENABLE_APP_SANDBOX = YES;");
  });

  it("quotes values that are not plain identifiers", () => {
    const p = renderPbxproj({ platform: "iOS", bundleId: "a.b", displayName: 'Say "hi"' });
    expect(p).toContain('INFOPLIST_KEY_CFBundleDisplayName = "Say \\"hi\\"";');
    expect(p).toContain('PRODUCT_NAME = "$(TARGET_NAME)";');
  });

  it("harness owns @main and exposes GeneratedAsset on both platforms", () => {
    for (const platform of ["iOS", "macOS"] as const) {
      const src = renderAppEntry({ platform, width: 1000, height: 700 });
      expect(src).toContain("@main");
      expect(src).toContain("RootView()");
      expect(src).toContain("enum GeneratedAsset");
    }
    expect(renderAppEntry({ platform: "macOS", width: 1000, height: 700 })).toContain("UIEE_WINDOW_ID=");
  });
});
