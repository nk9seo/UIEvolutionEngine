import type { Platform } from "@/lib/schemas";

/** Bundled sample references (original renders made for this project) with ready-to-run requests. */
export type Example = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  fileName: string;
  platform: Platform;
  prompt: string;
  useImageAssets: boolean;
};

export const EXAMPLES: Example[] = [
  {
    id: "taskboard",
    title: "TaskBoard dashboard",
    subtitle: "Web dashboard → dark macOS app",
    image: "/samples/taskboard-web.png",
    fileName: "taskboard-web.png",
    platform: "macOS",
    prompt:
      "Transform this interface into a premium native macOS application. Use a clean layout, subtle materials, balanced spacing, modern typography and a professional dark theme.",
    useImageAssets: false,
  },
  {
    id: "wanderly",
    title: "Wanderly travel site",
    subtitle: "Website → iPhone app with Muse Image art",
    image: "/samples/wanderly-web.png",
    fileName: "wanderly-web.png",
    platform: "iOS",
    prompt:
      "Turn this travel website into a polished native iPhone app: a tab bar for Explore, Trips and Saved, a large-title home with an illustrated hero, a search card, and swipeable destination cards. Light, airy theme with generous spacing.",
    useImageAssets: true,
  },
];
