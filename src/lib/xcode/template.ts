/**
 * Fixed Xcode project template for generated SwiftUI apps.
 *
 * The project uses a file-system-synchronized root group (objectVersion 77),
 * so every .swift file placed in the app folder is compiled without listing
 * it in project.pbxproj. Model output never touches this file.
 */

export type TargetPlatform = "iOS" | "macOS";

export const APP_TARGET_NAME = "GeneratedApp";

// Fixed object IDs (24 hex chars each). Stable IDs keep diffs between versions clean.
const ID = {
  product: "AE0000000000000000000001",
  appGroup: "AE0000000000000000000002",
  frameworks: "AE0000000000000000000003",
  mainGroup: "AE0000000000000000000004",
  productsGroup: "AE0000000000000000000005",
  target: "AE0000000000000000000006",
  targetConfigList: "AE0000000000000000000007",
  sources: "AE0000000000000000000008",
  resources: "AE0000000000000000000009",
  project: "AE000000000000000000000A",
  projectConfigList: "AE000000000000000000000B",
  projectDebug: "AE000000000000000000000C",
  projectRelease: "AE000000000000000000000D",
  targetDebug: "AE000000000000000000000E",
  targetRelease: "AE000000000000000000000F",
} as const;

function settingsBlock(settings: Record<string, string>, indent: string): string {
  return Object.entries(settings)
    .map(([k, v]) => `${indent}${k} = ${quote(v)};`)
    .join("\n");
}

function quote(v: string): string {
  return /^[A-Za-z0-9_./]+$/.test(v) ? v : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function projectSettings(debug: boolean): Record<string, string> {
  return {
    ALWAYS_SEARCH_USER_PATHS: "NO",
    CLANG_ENABLE_MODULES: "YES",
    CLANG_ENABLE_OBJC_ARC: "YES",
    COPY_PHASE_STRIP: "NO",
    DEBUG_INFORMATION_FORMAT: debug ? "dwarf" : "dwarf-with-dsym",
    ENABLE_STRICT_OBJC_MSGSEND: "YES",
    ENABLE_USER_SCRIPT_SANDBOXING: "YES",
    GCC_C_LANGUAGE_STANDARD: "gnu17",
    GCC_OPTIMIZATION_LEVEL: debug ? "0" : "s",
    ONLY_ACTIVE_ARCH: debug ? "YES" : "NO",
    SWIFT_COMPILATION_MODE: debug ? "singlefile" : "wholemodule",
    SWIFT_OPTIMIZATION_LEVEL: debug ? "-Onone" : "-O",
    ...(debug ? { SWIFT_ACTIVE_COMPILATION_CONDITIONS: "DEBUG $(inherited)" } : {}),
  };
}

function targetSettings(platform: TargetPlatform, bundleId: string, displayName: string): Record<string, string> {
  const common: Record<string, string> = {
    CODE_SIGN_IDENTITY: "-",
    CODE_SIGN_STYLE: "Manual",
    CURRENT_PROJECT_VERSION: "1",
    DEVELOPMENT_TEAM: "",
    ENABLE_PREVIEWS: "YES",
    GENERATE_INFOPLIST_FILE: "YES",
    INFOPLIST_KEY_CFBundleDisplayName: displayName,
    MARKETING_VERSION: "1.0",
    PRODUCT_BUNDLE_IDENTIFIER: bundleId,
    PRODUCT_NAME: "$(TARGET_NAME)",
    SWIFT_EMIT_LOC_STRINGS: "NO",
    SWIFT_VERSION: "5.0",
  };
  if (platform === "iOS") {
    return {
      ...common,
      SDKROOT: "iphoneos",
      IPHONEOS_DEPLOYMENT_TARGET: "18.0",
      TARGETED_DEVICE_FAMILY: "1,2",
      INFOPLIST_KEY_UIApplicationSceneManifest_Generation: "YES",
      INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents: "YES",
      INFOPLIST_KEY_UILaunchScreen_Generation: "YES",
      INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone: "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
      INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad: "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
      LD_RUNPATH_SEARCH_PATHS: "$(inherited) @executable_path/Frameworks",
    };
  }
  return {
    ...common,
    SDKROOT: "macosx",
    MACOSX_DEPLOYMENT_TARGET: "15.0",
    COMBINE_HIDPI_IMAGES: "YES",
    ENABLE_APP_SANDBOX: "YES",
    ENABLE_HARDENED_RUNTIME: "NO",
    INFOPLIST_KEY_NSHumanReadableCopyright: "",
    LD_RUNPATH_SEARCH_PATHS: "$(inherited) @executable_path/../Frameworks",
  };
}

function config(id: string, name: string, settings: Record<string, string>): string {
  return `\t\t${id} /* ${name} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
${settingsBlock(settings, "\t\t\t\t")}
\t\t\t};
\t\t\tname = ${name};
\t\t};`;
}

export function renderPbxproj(opts: { platform: TargetPlatform; bundleId: string; displayName: string }): string {
  const t = APP_TARGET_NAME;
  const ts = targetSettings(opts.platform, opts.bundleId, opts.displayName);
  return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 77;
\tobjects = {

/* Begin PBXFileReference section */
\t\t${ID.product} /* ${t}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${t}.app; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
\t\t${ID.appGroup} /* ${t} */ = {
\t\t\tisa = PBXFileSystemSynchronizedRootGroup;
\t\t\tpath = ${t};
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${ID.frameworks} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${ID.mainGroup} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.appGroup} /* ${t} */,
\t\t\t\t${ID.productsGroup} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${ID.productsGroup} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.product} /* ${t}.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${ID.target} /* ${t} */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${ID.targetConfigList} /* Build configuration list for PBXNativeTarget "${t}" */;
\t\t\tbuildPhases = (
\t\t\t\t${ID.sources} /* Sources */,
\t\t\t\t${ID.frameworks} /* Frameworks */,
\t\t\t\t${ID.resources} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t${ID.appGroup} /* ${t} */,
\t\t\t);
\t\t\tname = ${t};
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = ${t};
\t\t\tproductReference = ${ID.product} /* ${t}.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${ID.project} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 2700;
\t\t\t\tLastUpgradeCheck = 2700;
\t\t\t\tTargetAttributes = {
\t\t\t\t\t${ID.target} = {
\t\t\t\t\t\tCreatedOnToolsVersion = 27.0;
\t\t\t\t\t};
\t\t\t\t};
\t\t\t};
\t\t\tbuildConfigurationList = ${ID.projectConfigList} /* Build configuration list for PBXProject "${t}" */;
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = ${ID.mainGroup};
\t\t\tminimizedProjectReferenceProxies = 1;
\t\t\tpreferredProjectObjectVersion = 77;
\t\t\tproductRefGroup = ${ID.productsGroup} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t${ID.target} /* ${t} */,
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${ID.resources} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${ID.sources} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
${config(ID.projectDebug, "Debug", projectSettings(true))}
${config(ID.projectRelease, "Release", projectSettings(false))}
${config(ID.targetDebug, "Debug", ts)}
${config(ID.targetRelease, "Release", ts)}
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${ID.projectConfigList} /* Build configuration list for PBXProject "${t}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${ID.projectDebug} /* Debug */,
\t\t\t\t${ID.projectRelease} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
\t\t${ID.targetConfigList} /* Build configuration list for PBXNativeTarget "${t}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${ID.targetDebug} /* Debug */,
\t\t\t\t${ID.targetRelease} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */
\t};
\trootObject = ${ID.project} /* Project object */;
}
`;
}

/**
 * The fixed app entry point (never model output). Generated code must provide
 * `struct RootView: View`.
 *
 * macOS capture protocol (when UIEE_CAPTURE=1): after layout settles the app prints
 * `UIEE_WINDOW_ID=<n>` so the server can capture that one window with
 * `screencapture -l`. If the server answers `fallback` on stdin, the app renders its
 * own window with cacheDisplay and prints `UIEE_PNG_BASE64=<data>`. The app never
 * writes files, so it can run under App Sandbox.
 */
export function renderAppEntry(opts: { platform: TargetPlatform; width: number; height: number }): string {
  if (opts.platform === "iOS") {
    return `// Generated by UI Evolution Engine — fixed harness, not model output.
import SwiftUI
import UIKit

@main
struct GeneratedApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Images generated by Muse Image for this app, bundled as PNG resources.
enum GeneratedAsset {
    static func image(_ name: String) -> Image {
        let bundle = Bundle.main
        guard let url = bundle.url(forResource: name, withExtension: "png")
            ?? bundle.url(forResource: name, withExtension: "png", subdirectory: "Resources") else {
            return Image(systemName: "photo")
        }
        #if os(iOS)
        if let image = UIImage(contentsOfFile: url.path) { return Image(uiImage: image) }
        #else
        if let image = NSImage(contentsOf: url) { return Image(nsImage: image) }
        #endif
        return Image(systemName: "photo")
    }
}
`;
  }
  return `// Generated by UI Evolution Engine — fixed harness, not model output.
import SwiftUI
import AppKit

@main
struct GeneratedApp: App {
    @NSApplicationDelegateAdaptor(CaptureDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .defaultSize(width: ${opts.width}, height: ${opts.height})
    }
}

final class CaptureDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard ProcessInfo.processInfo.environment["UIEE_CAPTURE"] == "1" else { return }
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            guard let window = Self.mainWindow else { return }
            window.setContentSize(NSSize(width: ${opts.width}, height: ${opts.height}))
            window.center()
            window.makeKeyAndOrderFront(nil)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
            guard let window = Self.mainWindow else { return }
            Self.emit("UIEE_WINDOW_ID=\\(window.windowNumber)")
        }
        FileHandle.standardInput.readabilityHandler = { handle in
            let text = String(decoding: handle.availableData, as: UTF8.self)
            guard text.contains("fallback") else { return }
            DispatchQueue.main.async {
                Self.emit("UIEE_PNG_BASE64=" + (Self.renderWindow()?.base64EncodedString() ?? ""))
            }
        }
    }

    private static var mainWindow: NSWindow? {
        NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain })
    }

    private static func emit(_ line: String) {
        FileHandle.standardOutput.write(Data((line + "\\n").utf8))
    }

    private static func renderWindow() -> Data? {
        guard let window = mainWindow,
              let view = window.contentView?.superview ?? window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
        view.cacheDisplay(in: view.bounds, to: rep)
        return rep.representation(using: .png, properties: [:])
    }
}

/// Images generated by Muse Image for this app, bundled as PNG resources.
enum GeneratedAsset {
    static func image(_ name: String) -> Image {
        let bundle = Bundle.main
        guard let url = bundle.url(forResource: name, withExtension: "png")
            ?? bundle.url(forResource: name, withExtension: "png", subdirectory: "Resources") else {
            return Image(systemName: "photo")
        }
        #if os(iOS)
        if let image = UIImage(contentsOfFile: url.path) { return Image(uiImage: image) }
        #else
        if let image = NSImage(contentsOf: url) { return Image(nsImage: image) }
        #endif
        return Image(systemName: "photo")
    }
}
`;
}
