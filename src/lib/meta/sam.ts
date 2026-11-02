import "server-only";
import sharp from "sharp";
import { decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { MODELS } from "@/lib/config";
import { createResponse, imageDataUrl, type TextLaneEvent } from "@/lib/meta/client";
import type { SegmentationObject } from "@/lib/types";

/**
 * SAM 3.1 segmentation over the Responses API. One short noun phrase per request
 * (as the docs require); concepts run in parallel and are merged here. Output is
 * parsed with Meta's official @meta-sam/parser.
 */

// Short noun phrases, one per request. "rectangle" reliably captures flat cards, rows and
// selected list items in UI screenshots; "card" and "icon" catch richer designs.
export const UI_CONCEPTS = ["button", "rectangle", "card", "text input field", "icon", "sidebar", "title"] as const;

const MIN_CONFIDENCE = 0.35;
const COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee"];

type MaskShape = { concept: string; color: string; path: string; left: number; top: number };

async function* replay(events: TextLaneEvent[]) {
  for (const e of events) yield e;
}

async function segmentConcept(png: Buffer, concept: string, signal?: AbortSignal) {
  const events: TextLaneEvent[] = [];
  const result = await createResponse(
    {
      model: MODELS.sam,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: concept },
            { type: "input_image", image_url: imageDataUrl(png) },
          ],
        },
      ],
      metadata: { include_confidence: "true" },
    },
    { signal, onTextEvent: (e) => events.push(e) },
  );
  if (!events.some((e) => e.type === "response.completed")) events.push({ type: "response.completed" });
  const parsed = await parseImageStream(replay(events)).finalResult;
  const boxes = recordsOfKind(parsed.records, "box");
  const masks = recordsOfKind(parsed.records, "mask");
  return { boxes, masks, responseId: result.id, durationMs: result.durationMs };
}

export async function segmentInterface(
  png: Buffer,
  opts: { concepts?: readonly string[]; signal?: AbortSignal } = {},
) {
  const concepts = opts.concepts ?? UI_CONCEPTS;
  const started = Date.now();
  const settled = await Promise.allSettled(concepts.map((c) => segmentConcept(png, c, opts.signal)));

  const objects: SegmentationObject[] = [];
  const shapes: MaskShape[] = [];
  const responseIds: string[] = [];
  const failures: string[] = [];

  settled.forEach((s, i) => {
    const concept = concepts[i];
    if (s.status === "rejected") {
      failures.push(`${concept}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
      return;
    }
    responseIds.push(s.value.responseId);
    const color = COLORS[i % COLORS.length];
    for (const b of s.value.boxes) {
      const confidence = b.confidence ?? null;
      if (confidence !== null && confidence < MIN_CONFIDENCE) continue;
      objects.push({
        concept,
        objectId: b.objectId,
        box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
        confidence,
      });
      const mask = s.value.masks.find((m) => m.objectId === b.objectId);
      if (mask) {
        try {
          shapes.push({ concept, color, path: decodeMaskToSVGPath(mask.mask), left: mask.bounds.left, top: mask.bounds.top });
        } catch {
          // Undecodable mask: the box is still useful.
        }
      }
    }
  });

  if (failures.length === concepts.length) {
    throw new Error(`SAM 3.1 segmentation failed: ${failures.join("; ")}`);
  }

  return { objects, shapes, responseIds, failures, durationMs: Date.now() - started };
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Renders SAM masks and boxes over the reference image. */
export async function renderSegmentationOverlay(
  png: Buffer,
  width: number,
  height: number,
  objects: SegmentationObject[],
  shapes: MaskShape[],
  concepts: readonly string[],
): Promise<Buffer> {
  const colorOf = (concept: string) => COLORS[Math.max(0, concepts.indexOf(concept)) % COLORS.length];
  const stroke = Math.max(2, Math.round(width / 600));
  const font = Math.max(12, Math.round(width / 70));
  const masks = shapes
    .map((s) => `<path d="${s.path}" transform="translate(${s.left} ${s.top})" fill="${s.color}" fill-opacity="0.28" fill-rule="evenodd"/>`)
    .join("");
  const boxes = objects
    .map((o) => {
      const c = colorOf(o.concept);
      const w = o.box.right - o.box.left;
      const h = o.box.bottom - o.box.top;
      const label = `${o.concept}${o.confidence !== null ? ` ${Math.round(o.confidence * 100)}%` : ""}`;
      const ty = o.box.top > font + 6 ? o.box.top - 4 : o.box.top + font + 2;
      return `<rect x="${o.box.left}" y="${o.box.top}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="${stroke}" rx="3"/>` +
        `<text x="${o.box.left + 2}" y="${ty}" font-family="Helvetica, Arial, sans-serif" font-size="${font}" font-weight="600" fill="${c}" stroke="#000" stroke-opacity="0.55" stroke-width="${Math.max(1, font / 8)}" paint-order="stroke">${escapeXml(label)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${masks}${boxes}</svg>`;
  return sharp(png)
    .modulate({ brightness: 0.8 })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
