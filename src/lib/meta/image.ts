import "server-only";
import sharp from "sharp";
import { LIMITS, META_BASE_URL, MODELS, metaApiKey } from "@/lib/config";
import { MetaApiError } from "@/lib/meta/client";

/**
 * Muse Image (muse-image-1.0) via POST /v1/images/generations. Used for optional
 * decorative assets that the generated SwiftUI app bundles as PNG resources.
 */

const SIZES = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" } as const;

export async function generateImageAsset(
  prompt: string,
  aspect: keyof typeof SIZES,
  signal?: AbortSignal,
): Promise<{ png: Buffer; width: number; height: number; durationMs: number; usage: Record<string, unknown> | null }> {
  const started = Date.now();
  let delay = 800;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${META_BASE_URL}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${metaApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELS.image,
        prompt: `${prompt}\n\nDecorative app artwork. No text, letters, logos, watermarks or UI elements.`,
        n: 1,
        size: SIZES[aspect],
        response_format: "b64_json",
        output_format: "png",
        reasoning_strength: "low",
      }),
      signal,
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: Array<{ b64_json?: string }>; usage?: Record<string, unknown> };
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new MetaApiError("Muse Image returned no image", 502);
      // Keep the app bundle small: cap the long edge.
      const png = await sharp(Buffer.from(b64, "base64"))
        .resize({ width: LIMITS.assetLongEdge, height: LIMITS.assetLongEdge, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const meta = await sharp(png).metadata();
      return { png, width: meta.width ?? 0, height: meta.height ?? 0, durationMs: Date.now() - started, usage: body.usage ?? null };
    }
    const retryable = [429, 500, 502, 503, 504].includes(res.status);
    const detail = await res.text().catch(() => "");
    if (!retryable || attempt >= 3) throw new MetaApiError(`Muse Image ${res.status}: ${detail.slice(0, 300)}`, res.status);
    await new Promise((r) => setTimeout(r, delay + Math.random() * delay));
    delay *= 2;
  }
}
