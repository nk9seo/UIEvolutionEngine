# Submission form answers

## Project Description

UI Evolution Engine turns a screenshot into a compiled, running native SwiftUI app, then reviews and improves it on its own.

Screenshot-to-code tools stop at code: nobody compiles it, runs it, or checks how it looks, so the developer gets a pile of code that may not build and rarely matches the design. Our agent closes that loop. A developer drops in a screenshot of any app, website or design, describes the change they want and picks macOS or iOS. The agent then:

- segments the interface;
- writes a validated design spec and a multi-file SwiftUI project;
- compiles it with Xcode, sending compiler errors back for automatic repair;
- launches the app in the iOS Simulator or on the Mac and captures the real screen;
- compares that render with the reference and produces a scored, prioritized issue list.

One click turns selected issues plus the developer's own instruction into a new version, which is compiled, launched and reviewed again. Every version is kept, and the result opens directly in Xcode or downloads as a standalone project.

It is built for designers and iOS/macOS developers prototyping native apps, and for teams porting web products to Apple platforms. Nothing in the pipeline is mocked: every step is a real model call and a real Xcode build, and if the simulator is unavailable the app says so instead of faking a preview.

## Describe your use of Meta products to build the submitted project

Three Meta models do all of the AI work, called server-side through the Meta Model API.

**Muse Spark (`muse-spark-1.3`), via the Responses API.** It runs six stages:

1. Visual analysis of the screenshot.
2. A design specification and implementation plan.
3. Multi-file SwiftUI code generation.
4. Repair of real `xcodebuild` errors.
5. A two-image visual comparison of the running app against the reference.
6. Targeted improvements.

Every call uses streaming, with reasoning summaries shown live in the UI, and structured output (`text.format` with a JSON Schema). Each result is validated with Zod and retried once if invalid.

**SAM 3.1 (`sam-3.1`).** It segments the reference by concept: button, card, text input field, icon, sidebar, title. We parse the output with Meta's official `@meta-sam/parser`. The pixel boxes ground Muse Spark's measurements, and the masks are shown as an overlay.

**Muse Image (`muse-image-1.0`).** When Muse Spark's spec asks for artwork, Muse Image generates original images through `/v1/images/generations`. They are bundled into the Xcode project and used by the generated app.

Every version records model IDs, response IDs, token usage and timing, so you can audit each model call in the UI.

## Why are Meta's models important to your solution?

The product depends on a model that can see, reason and write code inside one loop, and Muse Spark does all three.

- It reads a screenshot and turns it into a precise, schema-valid spec.
- It writes Swift that compiles. When it doesn't, it fixes the code from the compiler's own diagnostics.
- It then judges the rendered app against the original image.

That last step is what makes self-improvement possible: the agent sees its own output the way a designer would. Streaming reasoning summaries make the agent's thinking visible as it works, and structured output makes every stage machine-checkable, so the pipeline can run unattended.

SAM 3.1 gives the agent pixel-accurate grounding that a language model alone does not have: real boxes for every button, card and field. Muse Image lets the generated app ship with original artwork instead of placeholders.

Without these models there is no loop. With them, a screenshot becomes a working native app that keeps getting reviewed and improved.
